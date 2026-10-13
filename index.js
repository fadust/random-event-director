import { Director, uuid } from './engine.js';
import { PresetLibrary } from './presets.js';
import { HeaderLibrary } from './headers.js';
import { ConnectionSettings } from './connections.js';
import { requestPool } from './api.js';
import { mountUI } from './ui.js';
import { Discussion } from './discussion.js';
import { Diagnostics, inspectPrompt, errorCategory } from './diagnostics.js';
import { requestGenerationType, eventGenerationType, stripOwnedInjection } from './request-isolation.js';
import { placeEventInMessages } from './outgoing-injection.js';
import { forcePayload, installRequestTrace } from './request-trace.js';
import { installTavernHelperTrace } from './tavern-helper-trace.js';
import { PromptPreview } from './main-prompt.js';

const PROMPT_KEY = 'random_event_director_one_turn';
const INSTANCE_KEY = '__randomEventDirectorV1';

export function install(host = globalThis.SillyTavern, doc = globalThis.document) {
    if (!host?.getContext) throw new Error('Random Event Director needs the standard SillyTavern.getContext()');
    globalThis[INSTANCE_KEY]?.dispose();
    const context = () => host.getContext();
    const ctx = context(), bus = ctx.eventSource, events = ctx.eventTypes;
    if (!bus?.on || !events?.GENERATION_STARTED || !ctx.setExtensionPrompt) throw new Error('SillyTavern lacks the generation event or hidden prompt API');
    let ui, requestTrace, injectionActive = false;
    const diagnostics = new Diagnostics(context);
    const presets = new PresetLibrary({ storage: () => context().extensionSettings,
        persist: () => context().saveSettingsDebounced(), makeId: uuid });
    const headers = new HeaderLibrary({ storage: () => context().extensionSettings,
        persist: () => context().saveSettingsDebounced(), makeId: uuid });
    const connection = new ConnectionSettings({ storage: () => context().extensionSettings,
        persist: () => context().saveSettingsDebounced() });
    const director = new Director({ context, request: (ctx, messages, settings, signal) => {
        const config = connection.read();
        requestTrace?.markSecondary(signal);
        director.trace('Secondary AI connection', 'info', 'Sending the request with the current secondary AI connection; request content and credentials are not logged.', { connectionMode: config.mode }, undefined, '');
        return requestPool(ctx, messages, settings, signal, config);
    }, presets, headers, connection, diagnostics,
        inject: text => {
            const current = context(), wasActive = injectionActive;
            try { current.setExtensionPrompt(PROMPT_KEY, text, 1, 0, false, 0); }
            catch (e) { director.trace(text ? 'Write extension prompt' : 'Clear extension prompt', 'error', 'SillyTavern\'s setExtensionPrompt API threw an exception.'); throw e; }
            injectionActive = Boolean(text);
            if (text || wasActive) {
                try {
                    const store = current.extensionPrompts, readable = !!store && typeof store === 'object';
                    const matches = readable && store[PROMPT_KEY]?.value === text;
                    director.trace(text ? 'Write extension prompt' : 'Clear extension prompt', readable && !matches ? 'warn' : (readable ? 'success' : 'info'),
                        text ? (readable ? (matches ? 'Read this round\'s injection back from SillyTavern\'s extension prompt; the final request still needs checking.' : 'The content read back after the call differs; it may have been overwritten, or the host API behaves differently.') : 'Called SillyTavern\'s injection API, but this version cannot read the extension prompt store.')
                            : 'This round\'s temporary prompt has been cleared.', { characters: text.length, storeReadable: readable, storeMatches: matches });
                } catch { director.trace('Injection store check', 'warn', 'Diagnostics cannot read back the extension prompt; the injection call completed and the generation flow is unchanged.'); }
            }
        },
        persist: snapshot => snapshot.saveMetadata(), changed: () => ui?.refresh(),
        log: (...args) => console.warn(...args) });
    new Discussion(director);
    const promptPreview = new PromptPreview(director, context, doc);
    director.readMainPrompt = (...args) => promptPreview.read(...args);
    const helperTrace = installTavernHelperTrace({ context, doc, record: (...args) => director.trace(...args) });
    diagnostics.refreshScripts = () => helperTrace.query();
    requestTrace = installRequestTrace({ context, helperTrace, previewing: () => Boolean(promptPreview.task),
        blockRequest: details => promptPreview.blockRequest(details), getEvent: () => {
        if (promptPreview.task) return null;
        const state = director.state(), run = director.run;
        if (state?.forceInjection && run && !run.cycleKey && !run.completed && !run.stopped) director.intercept(run.type);
        return director.forcedEvent();
    },
        onTransport: (...args) => director.transport(...args), record: (...args) => director.trace(...args) });
    const bindings = [], outgoingBindings = [];
    function listen(name, fn, late = false) {
        if (!events[name]) return;
        const guarded = (...args) => {
            if (promptPreview.task) {
                promptPreview.capture(name, args[0]);
                if (name === 'GENERATION_STARTED' && (promptPreview.start(args[1], args[2]) || promptPreview.task.started)) return;
                if (['GENERATION_STOPPED', 'GENERATION_ENDED', 'MESSAGE_RECEIVED'].includes(name)) return;
            }
            try { const result = fn(...args); if (result?.catch) result.catch(e => director.fail(e)); }
            catch (e) { director.trace('Host event exception', 'error', errorCategory(e)); director.clear(); director.fail(e); }
        };
        bus.on(events[name], guarded); bindings.push([events[name], guarded]);
        if (late) outgoingBindings.push([events[name], guarded]);
    }
    function rearmOutgoing(finalOnly = false) {
        if (typeof bus.makeLast !== 'function') return;
        for (const [name, handler] of outgoingBindings) {
            if (finalOnly && name === events.GENERATE_AFTER_DATA) continue;
            try { bus.makeLast(name, handler); }
            catch { director.trace('Pre-send listener order', 'warn', 'The host cannot reorder Chuyue\'s pre-send handling; running in the original listener order.'); }
        }
    }
    const interceptor = (_chat, _size, _abort, type) => {
        if (promptPreview.task) return;
        // Synchronous, bounded work only. Never wait for the secondary AI or abort the host.
        try { director.intercept(type); } catch (e) { director.trace('Injection exception', 'error', errorCategory(e)); director.clear(); director.fail(e); }
    };
    globalThis.randomEventDirectorInterceptor = interceptor;
    const refreshUI = () => { if (!ui) ui = mountUI(director, context, doc); ui?.refresh(); };
    listen('APP_READY', () => { refreshUI(); rearmOutgoing(); });
    listen('CHAT_CHANGED', () => { director.switchChat(); refreshUI(); });
    listen('CHAT_LOADED', () => { director.switchChat(); refreshUI(); });
    listen('GENERATION_STARTED', (...args) => { director.start(...args); rearmOutgoing(); ui?.refresh(); });
    listen('GENERATION_STOPPED', (...args) => { director.stop(false, eventGenerationType(args)); ui?.refresh(); });
    listen('GENERATION_ENDED', (...args) => { director.end(eventGenerationType(args)); ui?.refresh(); });
    listen('MESSAGE_RECEIVED', (...args) => director.receive(...args));
    listen('MESSAGE_EDITED', id => director.invalidate('edit', id));
    listen('MESSAGE_DELETED', id => director.invalidate('delete', id));
    listen('MESSAGE_SWIPED', id => director.invalidate('swipe', id));
    listen('MESSAGE_SWIPE_DELETED', id => director.invalidate('swipe', id));
    const userStop = event => { if (event.target?.closest?.('#mes_stop')) {
        if (promptPreview.task) promptPreview.cancel(); else director.stop(true);
        ui?.refresh();
    } };
    doc.addEventListener?.('click', userStop, true);
    function observeRequest(payload, dryRun, stage, final = false) {
        if (dryRun || promptPreview.task) return;
        const state = director.state(), run = director.run;
        if (state?.enabled && state.forceInjection) {
            if (run && !run.cycleKey && !run.stopped && !run.completed && run.metadata === context().chatMetadata) {
                try { director.intercept(run.type); } catch { /* Keep the selected event available to the transport fallback. */ }
            }
            const current = director.forcedEvent();
            if (!current?.injection) return;
            const changed = final && forcePayload(payload, current.injection);
            const check = inspectPrompt(payload, current.injection, current.event.content);
            if (final && run && !run.stopped && !run.completed && run.metadata === current.metadata && check.found) {
                run.injected = true; if (director.diagnosticRun) director.diagnosticRun.injected = true;
                director.requestChecked(check, true);
            }
            director.trace(final ? 'Force-injection target' : stage, check.found ? 'success' : 'warn',
                check.found ? 'Force mode detected the event in this request; not skipping because of background type, regeneration or unclear concurrency ownership.'
                    : 'No event detected at this stage; waiting for the transport-layer check. No new event drawn.',
                { generationType: requestGenerationType(payload) || 'unknown', injectionTarget: Array.isArray(payload?.messages) ? 'system' : 'prompt-prefix',
                    forceInjection: true, changed: Boolean(changed), characters: current.injection.length });
            return;
        }
        if (!state || !run || run.metadata !== context().chatMetadata || state.owner !== run.owner) return;
        const type = requestGenerationType(payload);
        let cycle = state.cycles[run.cycleKey];
        if (type && (!['normal', 'regenerate', 'swipe', 'continue', 'append'].includes(type) || type !== run.type)) {
            if (!run.stopped && !run.completed) director.background(type);
            if (final && cycle?.injection && stripOwnedInjection(payload, cycle.injection)) director.trace('Background request isolation', 'success', 'Removed Chuyue\'s injection for this round from send data that clearly belongs to the background; other extensions\' content and the main round store are untouched.');
            return;
        }
        if (run.stopped || run.completed) return;
        if (run.ownershipUncertain) {
            if (final && cycle?.injection) stripOwnedInjection(payload, cycle.injection);
            director.trace('Request ownership check', 'warn', 'Several text requests overlap and event ownership cannot be determined safely; not force-injecting and not consuming the pending event.'); return;
        }
        if (!type && run.overlapped) {
            director.trace('Request ownership check', 'skip', 'This request lacks enough main-round ownership information, or the generation type differs; the background request is not treated as the main reply.'); return;
        }
        if (!director.busy || !director.diagnosticRun?.eligible) return;
        if (final) director.requestChecked({ readable: false }, true);
        // The final event carries a type, unlike prompt-ready. Never force a repair into
        // an untyped request that might be a helper's independent recall or summary.
        if (final && type === run.type && state.outgoingInjection && Array.isArray(payload.messages)) {
            if (!run.cycleKey) {
                try { director.intercept(run.type); }
                catch { director.trace('Outgoing event tidy-up', 'warn', 'The native injection API threw an exception; checking whether the bound event can be written in directly.'); }
                cycle = state.cycles[run.cycleKey];
            }
            if (director.run === run && !run.stopped && !run.completed && !run.ownershipUncertain && cycle?.event && cycle.injection
                && !(cycle.status === 'consumed' && run.type === 'normal')) {
                const result = placeEventInMessages(payload.messages, cycle.injection, {
                    allowUser: ['normal', 'regenerate', 'swipe'].includes(run.type), mode: state.injectionMode });
                if (result.changed) payload.messages = result.messages;
                const verified = inspectPrompt(payload, cycle.injection, cycle.event.content);
                if (verified.found) {
                    run.injected = true; director.diagnosticRun.injected = true;
                    director.trace('Outgoing event tidy-up', result.changed ? 'success' : 'info', result.changed
                        ? (state.injectionMode === 'system' ? 'Arranged this round\'s event as a single standalone system message and self-checked; not attached to chat messages.'
                            : result.reason === 'moved' ? 'Arranged Chuyue\'s event at the front of the player message and self-checked; other extensions\' content untouched.'
                            : result.count > 1 ? 'Merged duplicate copies of Chuyue\'s event and self-checked; other extensions\' content untouched.'
                                : 'The event was missing before sending; restored from the current round and self-checked. No event was redrawn.')
                        : 'The full event is already in the request; the current format is not suited to moving it, so it stays in place to avoid breaking prefill or other content.',
                        { count: result.count || 0, characters: cycle.injection.length, injectionMode: state.injectionMode });
                } else director.trace('Outgoing event tidy-up', 'warn', 'Cannot confirm the full event entered the current send data; keeping the event, not marking it as used.');
            }
        }
        if (!run.injected || !cycle?.event) {
            director.trace(stage, director.diagnosticRun?.intercepted ? 'skip' : 'warn', director.diagnosticRun?.intercepted
                ? 'No event injected this round; the assembled request does not need to contain one.' : 'The main request was assembled, but this extension\'s injection callback was not received.'); return;
        }
        const check = inspectPrompt(payload, cycle.injection, cycle.event.content);
        director.requestChecked(check, final);
        if (director.diagnosticRun) director.diagnosticRun.observed = check.readable || director.diagnosticRun.observed;
        director.trace(stage, !check.readable ? 'warn' : (check.found ? 'success' : (check.eventFound || check.truncated ? 'warn' : 'error')),
            !check.readable ? 'This request data has no readable text prompt; the injection cannot be verified.'
                : check.found ? 'Full event injection detected. This check does not mean the model received or will follow the event.'
                    : check.truncated ? 'The request is too long and diagnostics only checked part of the text; no full injection detected, but loss cannot be concluded.'
                    : check.eventFound ? 'Event content detected, but the full injection template differs; the prompt may have been rewritten.'
                        : 'The injection API was called, but no event was detected in the main request at this stage; check prompt assembly, truncation or other extensions overriding it.',
            { expectedCharacters: cycle.injection?.length || 0, scannedCharacters: check.scannedCharacters, eventFound: check.eventFound, truncated: check.truncated });
    }
    function observeSafely(payload, dryRun, stage, final = false) {
        try { observeRequest(payload, dryRun, stage, final); }
        catch { director.trace(stage, 'warn', 'The injection check or tidy-up hit an exception at this stage; normal chat continues, and the pending event is kept when unconfirmed.'); }
    }
    listen('GENERATE_AFTER_DATA', (data, dryRun) => { rearmOutgoing(true); observeSafely(data, dryRun, 'Main request assembly check'); }, true);
    listen('CHAT_COMPLETION_SETTINGS_READY', data => {
        observeSafely(data, false, 'Chat Completion pre-send check', true);
    }, true);
    listen('TEXT_COMPLETION_SETTINGS_READY', data => {
        observeSafely(data, false, 'Text Completion pre-send check', true);
    }, true);
    diagnostics.record('Extension loaded', 'success', 'Director system started. Records actual requests, full responses, injection targets and identifiable extension call chains; unknown sources are not attributed. Chat text, keys, request headers and full prompts are not recorded.',
        { assembledHook: !!events.GENERATE_AFTER_DATA, requestHook: !!events.CHAT_COMPLETION_SETTINGS_READY }, { owner: null });
    if (!events.GENERATE_AFTER_DATA) diagnostics.record('Host compatibility', 'warn', 'SillyTavern provides no main request assembly event; some injection checks are unavailable, so injection failure cannot be concluded from them.', {}, { owner: null });
    if (!bus.makeLast) diagnostics.record('Host compatibility', 'warn', 'The host has no listener-order API; pre-send tidy-up still runs, but cannot be guaranteed to run after later-loaded extensions.', {}, { owner: null });
    rearmOutgoing();
    refreshUI();
    function dispose() {
        promptPreview.cancel();
        requestTrace.dispose();
        helperTrace.dispose();
        doc.removeEventListener?.('click', userStop, true);
        director.dispose(); ui?.dispose();
        for (const [name, handler] of bindings) bus.removeListener(name, handler);
        if (globalThis.randomEventDirectorInterceptor === interceptor) delete globalThis.randomEventDirectorInterceptor;
        globalThis.removeEventListener?.('pagehide', dispose);
        if (globalThis[INSTANCE_KEY]?.director === director) delete globalThis[INSTANCE_KEY];
    }
    globalThis.addEventListener?.('pagehide', dispose, { once: true });
    const instance = { director, diagnostics, dispose }; globalThis[INSTANCE_KEY] = instance;
    return instance;
}

if (globalThis.SillyTavern?.getContext && globalThis.document) {
    try { install(); } catch (e) { console.error('[Random Event Director] Failed to load; normal chat is unaffected', e); }
}
