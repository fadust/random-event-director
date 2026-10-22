import { apiBase, connectionConfig } from './connections.js';
import { nativePreset } from './headers.js';
import { markSecondaryPayload } from './request-isolation.js';

const SAMPLING_KEYS = Object.freeze(['presence_penalty', 'frequency_penalty', 'top_p', 'top_k', 'temperature']);
const COMPATIBILITY_KEYS = [...SAMPLING_KEYS, 'reasoning_effort'];
const REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
function readCustomConfig(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    try { return JSON.parse(raw); }
    catch {
        const parser = globalThis.SillyTavern?.libs?.yaml;
        if (!parser?.parse) throw new Error('SillyTavern lacks a YAML parsing API; update SillyTavern or write custom request parameters as JSON.');
        // Invalid YAML is also ignored by the host backend.
        try { return parser.parse(raw); } catch { return null; }
    }
}
function normalizeReasoning(body) {
    const value = body.reasoning_effort === 'min' ? 'minimal' : body.reasoning_effort;
    if (REASONING_EFFORTS.has(value)) body.reasoning_effort = value;
    else delete body.reasoning_effort; // "auto" is a host setting, not an API value.
}
function omitSampling(payload, enabled) {
    // Filter after the host applies its current preset, without changing the host's shared settings.
    const result = { ...payload };
    if (enabled) for (const key of COMPATIBILITY_KEYS) delete result[key];
    else if (['custom', 'openai', 'azure_openai'].includes(result.chat_completion_source)) normalizeReasoning(result);
    if (result.chat_completion_source === 'custom') {
        // The server merges custom_include_body later. Its exclusion list must also remove these keys.
        if (enabled) {
            const parsed = readCustomConfig(result.custom_exclude_body);
            const existing = Array.isArray(parsed) ? parsed.filter(key => typeof key === 'string')
                : typeof parsed === 'string' ? [parsed] : parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
            result.custom_exclude_body = JSON.stringify([...new Set([...existing, ...COMPATIBILITY_KEYS])]);
        } else {
            const extra = readCustomConfig(result.custom_include_body);
            if (extra && typeof extra === 'object' && !Array.isArray(extra) && Object.hasOwn(extra, 'reasoning_effort')) {
                const normalized = { ...extra }; normalizeReasoning(normalized);
                if (normalized.reasoning_effort !== extra.reasoning_effort) result.custom_include_body = JSON.stringify(normalized);
            }
        }
    }
    return result;
}

export async function requestModels(ctx, connection, signal, fetchImpl = globalThis.fetch) {
    const own = connectionConfig(connection);
    if (own.mode !== 'independent') throw new Error('Choose an independent secondary AI connection first');
    const endpoint = apiBase(own.endpoint);
    if (/\r|\n/.test(own.apiKey)) throw new Error('The API key cannot contain line breaks');
    if (!ctx.getRequestHeaders) throw new Error('This SillyTavern version lacks the request service; update SillyTavern');
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.throwIfAborted();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
    try {
        const response = await fetchImpl('/api/backends/chat-completions/status', {
            method: 'POST', headers: ctx.getRequestHeaders(), signal: controller.signal,
            body: JSON.stringify({ chat_completion_source: 'custom', custom_url: endpoint,
                custom_include_headers: JSON.stringify({ Authorization: own.apiKey ? `Bearer ${own.apiKey}` : '' }) }),
        });
        controller.signal.throwIfAborted();
        if (!response.ok) throw new Error();
        const data = await response.json();
        controller.signal.throwIfAborted();
        if (data?.error || !Array.isArray(data?.data)) throw new Error();
        const models = [...new Set(data.data.map(model => model?.id).filter(id =>
            typeof id === 'string' && id.trim() === id && id.length > 0 && id.length <= 200 && !/[\x00-\x1f\x7f]/.test(id)))].sort();
        if (!models.length) throw new Error('empty');
        return models;
    } catch (e) {
        signal?.throwIfAborted();
        if (timedOut) throw new Error('Fetching models timed out; try again later, or enter the model ID by hand.');
        if (e.message === 'empty') throw new Error('The endpoint returned no usable models; enter the model ID by hand.');
        throw new Error('Failed to fetch models; check the secondary API URL and key. The endpoint must support a model list, or enter the model ID by hand.');
    } finally {
        clearTimeout(timer); signal?.removeEventListener('abort', abort);
    }
}

export async function requestPool(ctx, messages, settings, signal, connection = { mode: 'current' }) {
    const maxTokens = Number.isInteger(settings.maxOutputTokens) ? Math.max(2200, Math.min(16000, settings.maxOutputTokens)) : 2200;
    const own = connectionConfig(connection);
    const send = (service, payload) => {
        const outbound = omitSampling(payload, own.excludeSampling);
        markSecondaryPayload(outbound);
        return service.sendRequest(outbound, true, signal);
    };
    // Headers supply text through the caller's messages, never generation parameters.
    // Validate a selected native reference, but do not pass it to the host request converter.
    nativePreset(settings.headerPreset, ctx);
    if (own.mode === 'independent') {
        const service = ctx.ChatCompletionService;
        if (!service?.sendRequest) throw new Error('This SillyTavern version lacks the independent request service; update SillyTavern');
        const endpoint = apiBase(own.endpoint);
        if (!own.model) throw new Error('Enter the secondary AI model ID');
        if (/\r|\n/.test(own.apiKey)) throw new Error('The API key cannot contain line breaks');
        // Start with a fresh payload. Never inherit another connection's credentials, URL, body or headers.
        const payload = { chat_completion_source: 'custom', custom_url: endpoint,
            custom_include_headers: JSON.stringify({ Authorization: own.apiKey ? `Bearer ${own.apiKey}` : '' }),
            custom_prompt_post_processing: '', model: own.model, messages, stream: false, max_tokens: maxTokens, n: 1, temperature: 0.8 };
        signal.throwIfAborted();
        try { return (await send(service, payload)).content; }
        catch (e) {
            const message = String(e?.message || 'Secondary AI request failed');
            throw new Error(own.apiKey ? message.replaceAll(own.apiKey, '[hidden]') : message);
        }
    }
    if (ctx.onlineStatus === 'no_connection') throw new Error('Connect a SillyTavern API first');
    if (!settings.useCurrentModel && !settings.model.trim()) throw new Error('Choose or enter a secondary AI model ID');
    const overrides = { stream: false, max_tokens: maxTokens, n: 1, temperature: 0.8 };
    if (!settings.useCurrentModel) overrides.model = settings.model.trim();
    if (ctx.mainApi === 'openai') {
        const service = ctx.ChatCompletionService;
        if (!service?.presetToGeneratePayload || !service?.sendRequest) throw new Error('This SillyTavern version lacks ChatCompletionService; update to standard SillyTavern');
        const payload = await service.presetToGeneratePayload({}, {}, { ...overrides, messages });
        signal.throwIfAborted();
        const result = await send(service, payload);
        return result.content;
    }
    if (ctx.mainApi === 'textgenerationwebui') {
        const service = ctx.TextCompletionService;
        if (!service?.presetToGeneratePayload || !service?.sendRequest) throw new Error('This SillyTavern version lacks TextCompletionService');
        const prompt = messages.map(m => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n') + '\n\nASSISTANT:\n';
        const payload = await service.presetToGeneratePayload({}, {}, { ...overrides, prompt });
        signal.throwIfAborted();
        return (await send(service, payload)).content;
    }
    throw new Error('The V0.1 secondary AI supports SillyTavern Chat Completion and Text Completion connections; the current API is not supported yet');
}
export function completionPresets(ctx, api = ctx.mainApi) {
    const names = ctx.getPresetManager?.(api)?.getPresetList?.()?.preset_names;
    return (Array.isArray(names) ? names : Object.keys(names || {})).filter(n => typeof n === 'string').sort();
}
