import { placeEventInMessages } from './outgoing-injection.js';
import { stripOwnedInjection, requestGenerationType } from './request-isolation.js';
import { inspectPrompt } from './diagnostics.js';

const ownFolder = new URL('.', import.meta.url).pathname.split('/').filter(Boolean).at(-1);
const ownFolders = new Set([ownFolder, 'random-event-director', 'random-event-director-special']);
const MAX_BODY = 2000000;

// Only extension-relative locations leave this function. Never export a raw stack or URL.
export function callerEvidence(stack = '') {
    const plugins = [], frames = [];
    const normalized = String(stack).replaceAll('\\', '/');
    const pattern = /\/scripts\/extensions\/third-party\/([^\s/?#():]+)\/([^\s?#():]+\.m?js)(?::(\d+)(?::(\d+))?)?/g;
    for (const match of normalized.matchAll(pattern)) {
        let folder; try { folder = decodeURIComponent(match[1]); } catch { continue; }
        folder = folder.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100);
        if (!folder || ownFolders.has(folder)) continue;
        if (!plugins.includes(folder)) plugins.push(folder);
        const location = `${folder}/${match[2].slice(0, 160)}${match[3] ? ':' + match[3] : ''}${match[4] ? ':' + match[4] : ''}`;
        if (!frames.includes(location)) frames.push(location);
        if (frames.length >= 5) break;
    }
    return { sourceEvidence: plugins.length ? 'stack' : 'unknown', sourcePlugins: plugins.join(', ') || 'Unknown', sourceFrames: frames.join('; ') };
}

export function forcePayload(payload, injection) {
    if (!payload || !injection || typeof payload !== 'object') return false;
    try {
        for (const key of ['messages', 'prompt']) {
            if (Array.isArray(payload[key])) {
                const result = placeEventInMessages(payload[key], injection, { mode: 'system' });
                if (result.changed) { payload[key] = result.messages; return true; }
                return false;
            }
        }
        if (typeof payload.prompt === 'string' && payload.prompt.length <= MAX_BODY) {
            const clean = { prompt: payload.prompt }; stripOwnedInjection(clean, injection);
            payload.prompt = `${injection}\n\n${clean.prompt}`; return true;
        }
    } catch { /* A diagnostic build must not break a request it cannot rewrite. */ }
    return false;
}

function endpointType(url) {
    let pathname; try { pathname = new URL(String(url), 'http://localhost').pathname; } catch { return null; }
    if (/\/api\/backends\/chat-completions\/generate\/?$/.test(pathname)) return 'chat-backend';
    if (/\/api\/backends\/(?:text-completions|kobold|koboldhorde|novel)\/generate\/?$/.test(pathname)) return 'text-backend';
    if (/\/chat\/completions\/?$/.test(pathname)) return 'chat-api';
    return null;
}
function safeModel(value) {
    const text = typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 120) : 'Unknown';
    return /bearer|sk-|[?&=]|https?:/i.test(text) ? 'Abnormal model field hidden' : text;
}

// Observe the body's existing consumer. No clone, parallel reader, or unbounded SSE buffer.
export function observeResponse(response, finished) {
    let ended = false, content = false, failed = !response.ok, tail = '', structuredRead = 0;
    const decoder = new TextDecoder();
    const finish = ok => { if (ok && structuredRead) return; if (!ended) { ended = true; finished(ok && content && !failed); } };
    const data = value => {
        if (value?.error) failed = true;
        const choices = value?.choices || [];
        if (typeof value === 'string' && value.trim()) content = true;
        if (choices.some(c => c?.message?.content || c?.delta?.content || c?.text)
            || value?.content || value?.token || value?.text || value?.results?.some(r => r?.text)) content = true;
    };
    const chunk = value => {
        if (ended) return;
        const text = typeof value === 'string' ? value : value instanceof Uint8Array ? decoder.decode(value, { stream: true }) : '';
        if (!text) { if (value?.data) { try { data(JSON.parse(value.data)); } catch { /* Unknown SSE format. */ } } return; }
        tail += text;
        let newline;
        while ((newline = tail.indexOf('\n')) >= 0) {
            const line = tail.slice(0, newline).trim(); tail = tail.slice(newline + 1);
            if (line.startsWith('data:') && line !== 'data: [DONE]') {
                try { data(JSON.parse(line.slice(5).trim())); } catch { /* Incomplete/unsupported data. */ }
            }
        }
        if (tail.length > 8192) tail = ''; // Bounded observation; never retain whole responses.
    };
    for (const method of ['json', 'text']) {
        const original = response[method];
        if (typeof original !== 'function') continue;
        try { response[method] = function (...args) {
            structuredRead++;
            let result;
            try { result = original.apply(this, args); } catch (error) { structuredRead--; finish(false); throw error; }
            result.then(value => {
                structuredRead--;
                if (method === 'json') data(value);
                else { try { data(JSON.parse(value)); } catch { chunk(value); } }
                finish(true);
            }, () => { structuredRead--; finish(false); });
            return result;
        }; } catch { /* Frozen response: leave normal consumption intact. */ }
    }
    const body = response.body;
    if (!body) { finish(false); return response; }
    function watchReader(stream, inspect = true) {
        const getReader = stream?.getReader;
        if (typeof getReader !== 'function') return;
        try { stream.getReader = function (...args) {
        const reader = getReader.apply(this, args), read = reader.read, cancel = reader.cancel;
        reader.read = function (...values) {
            const result = read.apply(this, values);
            result.then(row => { if (row.done) finish(true); else if (inspect) chunk(row.value); }, () => finish(false));
            return result;
        };
        if (cancel) reader.cancel = function (...values) { finish(false); return cancel.apply(this, values); };
        reader.closed?.catch(() => finish(false));
        return reader;
        }; } catch { /* Read-only stream. */ }
    }
    watchReader(body);
    const through = body.pipeThrough, to = body.pipeTo;
    const observer = () => new TransformStream({ transform(value, controller) { chunk(value); controller.enqueue(value); }, flush() { finish(true); } });
    if (typeof through === 'function' && typeof TransformStream === 'function') try {
        body.pipeThrough = function (transform, options) {
            watchReader(transform?.readable, false);
            const observed = through.call(this, observer(), options);
            return observed.pipeThrough(transform, options);
        };
        if (typeof to === 'function') body.pipeTo = function (destination, options) {
            const result = through.call(this, observer(), options).pipeTo(destination, options);
            result.catch(() => finish(false)); return result;
        };
    } catch { /* Unsupported pipeline: retain event rather than assume success. */ }
    return response;
}

export function installRequestTrace({ context, getEvent, record, helperTrace, onTransport = () => {}, blockRequest = () => null,
    previewing = () => false, host = globalThis, now = Date.now }) {
    let disposed = false, sequence = 0, notification = 0;
    const active = new Set(), fingerprints = new Map(), secondarySignals = new WeakSet();
    const salt = globalThis.crypto?.randomUUID?.() || `${Math.random()}-${now()}`;
    const bus = context()?.eventSource, types = context()?.eventTypes || {};
    const watched = new Map(['GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_SWIPE_DELETED']
        .filter(key => types[key]).map(key => [types[key], key]));
    const originalEmit = bus?.emit;
    const log = (stage, status, message, details, owner) => {
        try { record(stage, status, message, details, owner); } catch { /* Logging cannot affect host execution. */ }
    };
    const snapshotEvent = () => { try { return getEvent(); } catch { return null; } };
    const helperEvidence = stack => { try { return helperTrace?.evidence(stack) || {}; } catch { return {}; } };
    function wrappedEmit(name, ...args) {
        let helper = {};
        if (!disposed) { try { helper = helperTrace?.onEvent(name, args) || {}; } catch { /* Optional helper. */ } }
        if (!disposed && watched.has(name)) {
            const type = typeof args[0] === 'string' ? args[0] : args.find(value => typeof value === 'string');
            log(previewing() ? 'Prompt reference simulation notice' : 'Generation notice source', 'info', previewing()
                ? 'Simulating an empty send to read the prompt; not counted as a Chuyue main round. Other extensions may also respond to this notice.'
                : 'SillyTavern generation notice recorded; the number of notices is not the number of actual HTTP requests. The extension call chain is only a lead on the source.',
                { notificationNumber: ++notification, notificationType: watched.get(name),
                    generationType: requestGenerationType({ type: type || null }) || 'unknown', ...callerEvidence(new Error().stack), ...helper });
        }
        return originalEmit.call(this, name, ...args);
    }
    if (typeof originalEmit === 'function') bus.emit = wrappedEmit;

    async function fingerprint(payload) {
        if (!globalThis.crypto?.subtle) return null;
        const input = JSON.stringify({ messages: payload.messages, prompt: payload.prompt,
            model: payload.model, source: payload.chat_completion_source });
        try {
            const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '\n' + input));
            return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        } catch { return null; }
    }
    const originalFetch = host.fetch;
    async function wrappedFetch(input, init) {
        const receiver = this || host;
        const forward = args => originalFetch.apply(receiver, args);
        const isRequest = input && typeof input === 'object' && typeof input.clone === 'function' && typeof input.url === 'string';
        const route = endpointType(isRequest ? input.url : input);
        const method = String(init?.method ?? (isRequest ? input.method : 'GET')).toUpperCase();
        if (disposed || !route || method !== 'POST') return forward([input, init]);
        if (previewing()) {
            let previewPayload;
            try { previewPayload = JSON.parse(typeof init?.body === 'string' ? init.body : isRequest ? await input.clone().text() : 'null'); } catch { /* Unknown native body still must not escape the preview. */ }
            const signal = init?.signal ?? (isRequest ? input.signal : null);
            const blocked = blockRequest({ route, payload: previewPayload, secondary: signal && secondarySignals.has(signal) });
            if (blocked) {
                log('Prompt reference simulation stopped', 'success', 'The simulated text request was stopped locally before sending; it was not forwarded to the main AI.', { endpointType: route });
                throw blocked;
            }
        }
        const started = now(), requestNumber = ++sequence, requestId = `Request ${requestNumber}`;
        const stack = new Error().stack;
        const evidence = { ...callerEvidence(stack), ...helperEvidence(stack) };
        const snapshot = snapshotEvent();
        let nextArgs = [input, init], details = { requestId, requestNumber, endpointType: route, ...evidence };
        let transportEvent = null;
        try {
            const bodyText = typeof init?.body === 'string' ? init.body
                : init?.body === undefined && isRequest ? await input.clone().text() : null;
            if (typeof bodyText !== 'string' || bodyText.length > MAX_BODY) throw new Error('unsupported');
            const payload = JSON.parse(bodyText);
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('unsupported');
            details.model = safeModel(payload.model);
            details.generationType = requestGenerationType(payload) || 'unknown';
            const signal = init?.signal ?? (isRequest ? input.signal : null);
            details.requestRole = signal && secondarySignals.has(signal) ? 'secondary'
                : ['quiet', 'impersonate'].includes(details.generationType) ? 'background'
                    : snapshot?.run ? 'foreground' : 'unknown';
            const identity = JSON.parse(bodyText);
            if (snapshot?.injection) stripOwnedInjection(identity, snapshot.injection);
            const hash = await fingerprint(identity);
            // Never place a newly selected card's event into an earlier card's asynchronous request.
            const current = snapshotEvent();
            const sameChat = Boolean(snapshot && current && snapshot.metadata === current.metadata && snapshot.owner === current.owner);
            const stableEvent = sameChat && snapshot?.injection === current?.injection;
            if (hash && sameChat) {
                const key = current.owner + ':' + hash, previous = fingerprints.get(key);
                if (previous && started - previous.time < 60000) {
                    details.samePayloadAs = previous.id; details.samePayloadCount = previous.count + 1;
                    log('Possible duplicate send', 'warn', 'The same generation content was sent again within the last minute. It may be a retry or regeneration; this alone does not prove an extension is at fault.',
                        { ...details }, current.owner);
                }
                fingerprints.set(key, { id: requestId, time: started, count: details.samePayloadCount || 1 });
                if (fingerprints.size > 100) fingerprints.delete(fingerprints.keys().next().value);
            }
            details.forceInjection = Boolean(current?.enabled && current.forced && stableEvent && current.injection);
            details.injectionTarget = 'none';
            if (!disposed && details.forceInjection) {
                details.changed = forcePayload(payload, current.injection);
                details.eventPresent = inspectPrompt(payload, current.injection, current.event?.content).found;
                if (details.eventPresent) transportEvent = current;
                details.injectionTarget = Array.isArray(payload.messages) || Array.isArray(payload.prompt) ? 'system' : 'prompt-prefix';
                nextArgs = [input, { ...(init || {}), body: JSON.stringify(payload) }];
                log('Force injection into actual request', details.eventPresent ? 'success' : 'warn', details.eventPresent
                    ? 'Put the current chat\'s pending event into this actual generation request. Extensions in the call chain are source candidates, not culprits.'
                    : 'The request format or content cannot be tidied safely; the request is not blocked and injection success is not falsely reported.', details, current.owner);
            } else log('Actual generation request', 'info', sameChat ? 'Recorded the actual send: no pending event at present, or force mode is off.'
                : 'The chat or event switched while reading; the other chat\'s new event is not added to this request.', details, snapshot?.owner);
        } catch {
            log('Actual request check', 'warn', 'Unsupported request body format; sent as is. Text, URL, headers and raw errors are not recorded.', details, snapshot?.owner);
        }
        active.add(requestId);
        const transport = phase => { try { onTransport(transportEvent, phase, details); } catch { /* Optional lifecycle observer. */ } };
        transport('start');
        log('Actual request started', 'info', 'Started waiting for this request\'s response headers; actual request numbers can be told apart from generation notices.', { ...details, activeRequests: active.size }, snapshot?.owner);
        try {
            const response = await forward(nextArgs);
            log('Actual request response', response.ok ? 'success' : 'warn', 'Response headers received; this does not mean the streamed text is complete, nor that the model followed the event.',
                { ...details, httpStatus: response.status, durationMs: Math.max(0, now() - started), outcome: 'response' }, snapshot?.owner);
            if (!response.ok) { active.delete(requestId); transport('failed'); return response; }
            const bodyFinished = ok => {
                active.delete(requestId);
                if (disposed) return;
                log('Actual request body complete', ok ? 'success' : 'warn', ok ? 'The caller has read the full model response. Body completion and host notices are recorded separately.'
                    : 'Valid text not confirmed as fully returned; a cancel, error or unknown format does not consume the pending event.',
                    { ...details, durationMs: Math.max(0, now() - started), outcome: ok ? 'complete' : 'incomplete', activeRequests: active.size }, snapshot?.owner);
                transport(ok ? 'complete' : 'failed');
            };
            try { return observeResponse(response, bodyFinished); }
            catch { bodyFinished(false); return response; }
        } catch (error) {
            log('Actual request failed', 'error', 'The request got no normal response; the original exception is passed to the caller and the log does not record the error text.',
                { ...details, durationMs: Math.max(0, now() - started), outcome: error?.name === 'AbortError' ? 'aborted' : 'network-error' }, snapshot?.owner);
            active.delete(requestId); transport('failed'); throw error;
        }
    }
    if (typeof originalFetch === 'function') host.fetch = wrappedFetch;
    else log('Transport-layer diagnostics', 'warn', 'No observable fetch in this environment; still using SillyTavern\'s request hooks, so actual HTTP sends cannot be recorded.', {});
    return { markSecondary(signal) { if (signal && typeof signal === 'object') secondarySignals.add(signal); }, dispose() {
        disposed = true;
        if (host.fetch === wrappedFetch) host.fetch = originalFetch;
        if (bus?.emit === wrappedEmit) bus.emit = originalEmit;
        fingerprints.clear();
    } };
}
