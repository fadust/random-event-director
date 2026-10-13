// Observe helper metadata and API calls only. Never export script code, variables or call arguments.
import { callerEvidence } from './request-trace.js';
const METHODS = ['generate', 'generateRaw', 'stopGenerationById', 'stopAllGeneration',
    'triggerSlash', 'triggerSlashWithResult', 'eventEmit', 'eventEmitAndWait'];
const SCOPES = ['global', 'preset', 'character'];
const clean = (value, max = 120) => typeof value === 'string'
    ? value.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max) : '';
const identity = frame => {
    const value = frame?.id || frame?.name || '';
    const match = /^TH-script--(.+)--([^\s]+)$/.exec(value);
    return match ? { scriptName: clean(match[1]), scriptId: clean(match[2]), scriptScope: 'unknown' } : null;
};

export function installTavernHelperTrace({ host = globalThis, doc = host.document, context, record, now = Date.now }) {
    let disposed = false, callNumber = 0, current = null, inventoryKey = '', helperSeen = false;
    let lastMetadata, lastHelper, lastTreeAPI, lastQueryAt = 0, scheduled = false;
    const hooks = [], metadata = new Map(), frames = new Map(), calls = new Map(), generations = new Map();
    const log = (stage, status, message, details = {}) => {
        if (!disposed) { try { record(stage, status, message, details); } catch { /* Passive diagnostics. */ } }
    };
    const describe = call => call ? { helperCallId: call.id, helperMethod: call.method,
        scriptName: call.scriptName, scriptId: call.scriptId, scriptScope: call.scriptScope, ...call.caller } : {};
    const chatMetadata = () => { try { return context?.()?.chatMetadata; } catch { return null; } };
    let eventTypes = {}; try { eventTypes = context?.()?.eventTypes || {}; } catch { /* Optional context. */ }
    const refreshEvents = new Set(['APP_READY', 'CHAT_CHANGED', 'CHAT_LOADED', 'OAI_PRESET_CHANGED_AFTER',
        'PRESET_CHANGED', 'SETTINGS_UPDATED'].map(key => eventTypes[key]).filter(Boolean));
    function scheduleQuery() {
        if (disposed || scheduled) return;
        scheduled = true;
        const refresh = () => { scheduled = false; if (!disposed) query(false); };
        if (host.setTimeout) host.setTimeout(refresh, 0);
        else Promise.resolve().then(refresh);
    }
    function sourceFromStack(stack) {
        const found = [];
        for (const [frame, item] of frames) {
            // A blob URL belongs to a specific iframe; no URL is copied into the report.
            try { if (frame.src?.startsWith('blob:') && String(stack).includes(frame.src)) found.push(item); } catch { /* Removed iframe. */ }
        }
        return found.length === 1 ? found[0] : null;
    }
    function wrap(target, method, source) {
        if (!target) return;
        let original; try { original = target[method]; } catch { return; }
        if (typeof original !== 'function' || hooks.some(h => h.target === target && h.method === method && h.wrapper === original)) return;
        function wrapper(...args) {
            if (disposed || current) return original.apply(this, args);
            if (['eventEmit', 'eventEmitAndWait'].includes(method)
                && !Object.values(eventTypes).filter(x => /generat|message/i.test(x)).includes(args[0])
                && !['js_generation_requested', 'js_generation_started', 'js_generation_ended'].includes(args[0])) return original.apply(this, args);
            const identified = source ? { ...source, ...(metadata.get(source.scriptId) || {}) } : sourceFromStack(new Error().stack);
            const call = { id: `Helper call ${++callNumber}`, method, ...(identified || {
                scriptName: 'Unknown', scriptId: '', scriptScope: 'unknown' }), caller: callerEvidence(new Error().stack), metadata: chatMetadata() };
            calls.set(call.id, call);
            log('Tavern Helper script call', 'info', identified ? 'Captured this script calling the Helper API directly; an API call is not the same as an HTTP request being sent.'
                : 'Captured a Helper API call, but the script identity cannot be confirmed.',
                { ...describe(call), scriptEvidence: identified ? 'api-call' : 'unknown' });
            const before = current; current = call;
            let result;
            try { result = original.apply(this, args); }
            catch (error) { calls.delete(call.id); log('Tavern Helper call finished', 'warn', 'The Helper API threw an exception; the original exception is kept and the error text is not recorded.', describe(call)); throw error; }
            finally { current = before; }
            const finish = failed => {
                calls.delete(call.id);
                log('Tavern Helper call finished', failed ? 'warn' : 'info', failed ? 'The Helper call did not finish normally; result and raw error are not recorded.' : 'The Helper call finished; the returned content is not recorded.', describe(call));
            };
            // Return the original result/promise unchanged; don't serialize arguments or results.
            if (result && typeof result.then === 'function') result.then(() => finish(false), () => finish(true));
            else finish(false);
            return result;
        }
        try { target[method] = wrapper; if (target[method] === wrapper) hooks.push({ target, method, original, wrapper }); } catch { /* Read-only API. */ }
    }
    function scan() {
        if (disposed) return;
        const helper = host.TavernHelper;
        if (helper && !helperSeen) {
            helperSeen = true;
            let version = ''; try { version = clean(helper.getTavernHelperVersion?.()); } catch { /* Optional API. */ }
            log('Tavern Helper connection', 'info', 'Connected to Tavern Helper diagnostics. The script list only shows configuration or window state; direct calls and request links are recorded separately.', { helperAvailable: true, helperVersion: version || 'Unknown' });
        }
        for (const method of METHODS) wrap(helper, method, null);
        let present = [];
        try { present = [...(doc?.querySelectorAll?.('iframe[id^="TH-script--"]') || [])]; } catch { /* Optional DOM. */ }
        for (const frame of frames.keys()) if (!present.includes(frame)) frames.delete(frame);
        for (const frame of present) {
            const id = identity(frame); if (!id) continue;
            const known = metadata.get(id.scriptId), item = { ...id, ...(known || {}) };
            frames.set(frame, item);
            try {
                const win = frame.contentWindow;
                for (const method of METHODS) wrap(win, method, item);
                // Some scripts use their frame's TavernHelper.generate instead of the global generate.
                if (win?.TavernHelper && win.TavernHelper !== helper) for (const method of METHODS) wrap(win.TavernHelper, method, item);
            } catch { /* Cross-origin frame: metadata stays visible, API interception is unavailable. */ }
        }
    }
    function query(force = true) {
        if (disposed) return;
        try {
            const helper = host.TavernHelper, rows = [];
            lastQueryAt = now(); lastHelper = helper; lastTreeAPI = helper?.getScriptTrees;
            metadata.clear();
            if (typeof helper?.getScriptTrees === 'function') {
                for (const scope of SCOPES) {
                    let trees; try { trees = helper.getScriptTrees({ type: scope }); } catch { continue; }
                    if (!Array.isArray(trees)) continue;
                    const visit = (tree, parentEnabled = true) => {
                        if (!tree || rows.length >= 100) return;
                        const enabled = parentEnabled && tree.enabled === true;
                        if (tree.type === 'folder') { for (const child of (Array.isArray(tree.scripts) ? tree.scripts : [])) visit(child, enabled); }
                        else if (tree.type === 'script') {
                            const row = { scriptId: clean(tree.id), scriptName: clean(tree.name), scriptScope: scope, scriptEnabled: enabled };
                            rows.push(row); metadata.set(row.scriptId, row);
                        }
                    };
                    for (const tree of trees) visit(tree);
                }
            }
            scan();
            const activeIds = new Set([...frames.values()].map(x => x.scriptId));
            for (const row of rows) row.scriptWindowPresent = activeIds.has(row.scriptId);
            for (const item of frames.values()) if (!metadata.has(item.scriptId)) rows.push({ ...item, scriptWindowPresent: true });
            const key = JSON.stringify({ helperAvailable: Boolean(helper), scriptListAvailable: typeof helper?.getScriptTrees === 'function', rows });
            const ownerMetadata = chatMetadata();
            if (force || key !== inventoryKey || ownerMetadata !== lastMetadata) {
                inventoryKey = key; lastMetadata = ownerMetadata;
                log('Tavern Helper script query', helper ? 'info' : 'warn', helper ? 'Querying global, preset and current character card scripts; being enabled or having a window does not mean a script started the current request.'
                    : 'Tavern Helper not found yet; it will connect and query automatically once loaded.',
                    { helperAvailable: Boolean(helper), scriptListAvailable: typeof helper?.getScriptTrees === 'function', scriptCount: rows.length });
                for (const row of rows.slice(0, 100)) log('Tavern Helper script status', 'info', 'Only script names, identifiers and status are recorded; script content is never recorded or executed.', row);
            }
        } catch { log('Tavern Helper script query', 'warn', 'The Helper query API is unavailable for now; regular request diagnostics continue and generation is unaffected.'); }
    }
    function evidence(stack = '') {
        if (current) return { ...describe(current), scriptEvidence: current.scriptId ? 'api-call' : 'unknown' };
        const fromFrame = sourceFromStack(stack);
        if (fromFrame) return { scriptName: fromFrame.scriptName, scriptId: fromFrame.scriptId, scriptScope: fromFrame.scriptScope, scriptEvidence: 'iframe-stack' };
        const sameChat = [...calls.values()].filter(c => c.metadata === chatMetadata() && ['generate', 'generateRaw', 'triggerSlash', 'triggerSlashWithResult'].includes(c.method));
        if (!sameChat.length) return { scriptEvidence: 'unknown' };
        return { scriptEvidence: 'candidate', helperActiveCalls: sameChat.length,
            candidateScripts: [...new Set(sameChat.map(c => `${c.scriptName} (${c.id})`))].join('; ').slice(0, 500) };
    }
    function onEvent(name, args) {
        if (refreshEvents.has(name)) scheduleQuery();
        if (name === eventTypes.GENERATION_STARTED) query(false);
        const names = ['js_generation_requested', 'js_generation_started', 'js_generation_ended'];
        if (!names.includes(name)) return evidence(new Error().stack);
        const generationId = name === 'js_generation_ended' ? args[1] : args[0];
        // Keep the host's opaque generation ID private; reports use our own call number.
        if (name === 'js_generation_requested' && typeof generationId === 'string' && current) {
            generations.set(generationId, current);
            if (generations.size > 100) generations.delete(generations.keys().next().value);
        }
        const call = generations.get(generationId), details = call
            ? { ...describe(call), scriptEvidence: call.scriptId ? 'generation-id' : 'unknown' } : evidence();
        log('Tavern Helper generation notice', 'info', 'Helper generation lifecycle notice; counted separately from actual HTTP requests, without recording text or settings.', { helperEvent: name, ...details });
        if (name === 'js_generation_ended') generations.delete(generationId);
        return details;
    }
    const load = event => { if (identity(event.target)) scheduleQuery(); };
    doc?.addEventListener?.('load', load, true);
    let observer;
    if (host.MutationObserver && doc?.documentElement) {
        observer = new host.MutationObserver(records => {
            if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n?.matches?.('iframe[id^="TH-script--"]') || n?.querySelector?.('iframe[id^="TH-script--"]')))) scheduleQuery();
        });
        observer.observe(doc.documentElement, { childList: true, subtree: true });
    }
    // Cheap hook scan every two seconds; metadata polling is slower and logs only changes.
    const timer = host.setInterval?.(() => { try {
        if (host.TavernHelper !== lastHelper || host.TavernHelper?.getScriptTrees !== lastTreeAPI
            || chatMetadata() !== lastMetadata || now() - lastQueryAt >= 10000) query(false);
        else scan();
    } catch { /* Diagnostic only. */ } }, 2000);
    timer?.unref?.();
    query();
    return { query, evidence, onEvent, dispose() {
        disposed = true; observer?.disconnect(); host.clearInterval?.(timer); doc?.removeEventListener?.('load', load, true);
        for (const h of hooks.slice().reverse()) { try { if (h.target[h.method] === h.wrapper) h.target[h.method] = h.original; } catch { /* Removed frame. */ } }
        hooks.length = 0; calls.clear(); frames.clear(); metadata.clear(); generations.clear();
    } };
}
