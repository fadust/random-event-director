import { requestModels } from './api.js';

export function mountConnectionUI(host, director, doc) {
    host.innerHTML = `<details class="red-connection" open><summary>Secondary AI connection</summary><div class="red-body">
      <label class="red-column">Secondary AI connection mode<select class="text_pole" data-connection="mode"><option value="independent">Separate URL and key</option><option value="current">Use the current SillyTavern connection</option></select></label>
      <div data-connection-role="own" class="red-body">
        <label class="red-column">Secondary AI API URL<input class="text_pole" type="url" data-connection="endpoint" placeholder="https://example.com/v1" autocomplete="off"></label>
        <label class="red-column">Secondary AI API key<input class="text_pole" type="password" data-connection="apiKey" placeholder="Key for this URL; leave empty if none is needed" autocomplete="new-password" spellcheck="false"></label>
        <label class="red-column">Independent secondary AI model ID<input class="text_pole" data-connection="model" placeholder="Model ID from the API provider" autocomplete="off"></label>
        <div class="red-actions"><button type="button" class="menu_button" data-connection-action="models">Fetch models</button></div>
        <label class="red-column">Choose model<select class="text_pole" data-connection-role="models"><option value="">Fetch models first, or enter one above by hand</option></select></label>
        <p class="red-help">Fetching uses the URL and key above. Choose a model, then click save; no need to enter a model ID first.</p>
        <p class="red-help">Supports OpenAI-compatible APIs. Settings are saved in SillyTavern's extension settings; the key is never exported with director or header presets.</p>
      </div><label class="checkbox_label"><input type="checkbox" data-connection="excludeSampling">Exclude temperature and sampling parameters (compatibility mode)</label>
      <p class="red-help">When ticked, the secondary AI's event generation and side-window discussion do not send presence_penalty, frequency_penalty, top_p, top_k, temperature or reasoning_effort, and use the API defaults. Affects only the secondary AI; saved as soon as ticked.</p>
      <button type="button" class="menu_button" data-connection-action="save">Save secondary AI settings</button>
      <p class="red-help">Switching the connection mode takes effect at once. With the current SillyTavern connection, the main API's URL and key are reused and no secondary API is needed; after changing the separate URL, key or model, click save.</p><p data-connection-role="notice" aria-live="polite"></p></div></details>`;
    const root = host.querySelector('.red-connection'), field = key => root.querySelector(`[data-connection="${key}"]`);
    const modelList = root.querySelector('[data-connection-role="models"]'), modelButton = root.querySelector('[data-connection-action="models"]');
    const notice = root.querySelector('[data-connection-role="notice"]');
    let fingerprint = '', disposed = false, modelRequest = null, modelSource = '';
    const source = () => JSON.stringify(['mode', 'endpoint', 'apiKey'].map(key => field(key).value));
    function invalidateModels() {
        modelRequest?.abort(); modelRequest = null; modelSource = '';
        modelList.replaceChildren(new Option('Fetch models first, or enter one above by hand', ''));
        modelButton.textContent = 'Fetch models';
    }
    const display = () => { root.querySelector('[data-connection-role="own"]').hidden = field('mode').value !== 'independent'; };
    function refresh() {
        if (disposed) return;
        const config = director.connection?.read() || { mode: 'current', endpoint: '', apiKey: '', model: '' };
        const serial = JSON.stringify(config);
        if (serial !== fingerprint) {
            const previous = source();
            for (const key of ['mode', 'endpoint', 'apiKey', 'model']) field(key).value = config[key];
            field('excludeSampling').checked = config.excludeSampling === true;
            if (source() !== previous) invalidateModels();
            fingerprint = serial; display();
        }
        for (const control of root.querySelectorAll('input,select,button')) control.disabled = director.busy || !director.connection;
        modelButton.disabled ||= !!modelRequest;
        modelList.disabled ||= modelList.options.length <= 1;
    }
    const save = () => {
        try {
            director.applyConnection({ ...Object.fromEntries(['mode', 'endpoint', 'apiKey', 'model'].map(k => [k, field(k).value])),
                excludeSampling: field('excludeSampling').checked });
            refresh(); root.querySelector('[data-connection-role="notice"]').textContent = 'Secondary AI settings saved.';
        } catch (e) {
            field('mode').value = director.connection?.read().mode || 'current'; display();
            root.querySelector('[data-connection-role="notice"]').textContent = e.message;
        }
    };
    async function loadModels() {
        if (modelRequest || director.busy || field('mode').value !== 'independent') return;
        invalidateModels();
        const controller = new AbortController(), captured = source();
        modelRequest = controller; modelButton.textContent = 'Fetching…'; notice.textContent = 'Fetching model list…'; refresh();
        try {
            const models = await requestModels(director.context(), Object.fromEntries(['mode', 'endpoint', 'apiKey'].map(key => [key, field(key).value])), controller.signal);
            if (disposed || controller.signal.aborted || source() !== captured) return;
            modelSource = captured;
            modelList.replaceChildren(new Option('Choose a model', ''), ...models.map(id => new Option(id, id)));
            modelList.value = models.includes(field('model').value) ? field('model').value : '';
            notice.textContent = `Fetched ${models.length} models. After choosing, save the secondary AI settings.`;
        } catch (e) {
            if (!disposed && !controller.signal.aborted && source() === captured) notice.textContent = e.message;
        } finally {
            if (modelRequest === controller) { modelRequest = null; modelButton.textContent = 'Fetch models'; refresh(); }
        }
    }
    const input = event => {
        if (['endpoint', 'apiKey'].includes(event.target.dataset.connection)) {
            invalidateModels(); notice.textContent = ''; refresh();
        } else if (event.target.dataset.connection === 'model') {
            modelList.value = field('model').value;
        }
    };
    const change = event => {
        if (event.target.dataset.connection === 'mode') { invalidateModels(); save(); }
        else if (event.target.dataset.connection === 'excludeSampling') save();
        else if (event.target === modelList && modelSource === source() && modelList.value) field('model').value = modelList.value;
    };
    const click = event => {
        if (event.target.closest('[data-connection-action="save"]')) save();
        else if (event.target.closest('[data-connection-action="models"]')) void loadModels();
    };
    root.addEventListener('input', input); root.addEventListener('change', change); root.addEventListener('click', click); refresh();
    return { refresh, dispose() { disposed = true; invalidateModels(); root.removeEventListener('input', input); root.removeEventListener('change', change); root.removeEventListener('click', click); root.remove(); } };
}
