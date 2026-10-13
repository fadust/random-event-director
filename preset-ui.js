import { DEFAULT_PRESET, BUILTIN_PRESETS, activePreset, normalizePreset } from './presets.js';

export function mountPresetUI(host, director, context, doc) {
    host.innerHTML = `<details class="red-presets"><summary>Director preset management</summary>
      <div class="red-body"><p data-preset-role="active"></p>
      <label class="red-column">Choose preset<select class="text_pole" data-preset-field="selected"></select></label>
      <div class="red-actions"><button type="button" class="menu_button" data-preset-action="import">Import JSON</button></div>
      <input type="file" accept=".json,application/json" data-preset-field="file" hidden>
      <p class="red-help" data-preset-role="scope"></p>
      <p data-preset-role="notice" aria-live="polite"></p>
      <label class="red-column">Preset name<input class="text_pole" data-preset-field="name" maxlength="80"></label>
      <label class="red-column">Secondary AI event generation prompt<textarea class="text_pole" rows="7" data-preset-field="generatorPrompt"></textarea></label>
      <label class="red-column">Main AI hidden injection template<textarea class="text_pole" rows="7" data-preset-field="injectionTemplate"></textarea></label>
      <p class="red-help">The secondary AI prompt must contain {{count}}, and the injection template must contain {{event}}. Available: {{char}}, {{user}}; the injection can also use {{title}}, {{type}}. The fixed JSON output protocol and the "no predetermined outcomes/player actions, never reveal the hidden system" rules always stay.</p>
      <div class="red-actions"><button type="button" class="menu_button" data-preset-action="apply">Apply to this chat</button>
      <button type="button" class="menu_button" data-preset-action="save">Save preset</button>
      <button type="button" class="menu_button" data-preset-action="copy">Save as</button>
      <button type="button" class="menu_button" data-preset-action="reset">Restore default</button>
      <button type="button" class="menu_button" data-preset-action="delete">Delete selected preset</button></div>
      <details><summary>Export JSON</summary><div class="red-body">
      <div class="red-actions"><button type="button" class="menu_button" data-preset-action="export">Export selected</button>
      <button type="button" class="menu_button" data-preset-action="export-all">Export all custom presets</button>
      <button type="button" class="menu_button" data-preset-action="download">Download JSON</button></div>
      <label class="red-column">Export content<textarea class="text_pole" rows="6" data-preset-field="json" readonly placeholder="Click an export button above to generate JSON, then copy or download it"></textarea></label>
      </div></details><div class="red-add"><button type="button" class="menu_button" data-preset-action="new">Add custom director preset</button>
      <p class="red-help">Create a new preset, fill in its name and prompts above, then click save.</p></div>
      </div></details>`;
    const root = host.querySelector('.red-presets'), get = key => root.querySelector(`[data-preset-field="${key}"]`);
    const role = key => root.querySelector(`[data-preset-role="${key}"]`);
    let draft = { ...DEFAULT_PRESET }, owner = null, snapshot = '', disposed = false;
    let libraryFingerprint = '';
    function options(select, rows, chosen) {
        select.replaceChildren();
        for (const row of rows) { const option = doc.createElement('option'); option.value = row.value; option.textContent = row.label; select.append(option); }
        select.value = chosen;
    }
    function paint() {
        for (const key of ['name', 'generatorPrompt', 'injectionTemplate']) get(key).value = draft[key];
        get('selected').value = draft.id;
    }
    function read() {
        return normalizePreset({ ...draft, name: get('name').value, generatorPrompt: get('generatorPrompt').value,
            injectionTemplate: get('injectionTemplate').value });
    }
    function catalog() { return director.presets?.list() || BUILTIN_PRESETS.map(p => ({ ...p })); }
    function refresh() {
        if (disposed) return;
        try {
            const chat = director.state(), state = director.settingsState(), active = activePreset(state?.directorPreset);
            const serial = JSON.stringify(active);
            if (owner !== state?.owner || snapshot !== serial) {
                draft = { ...active }; owner = state?.owner; snapshot = serial;
                role('notice').textContent = ''; libraryFingerprint = '';
                paint();
            }
            role('active').textContent = `${chat ? 'Current chat preset' : 'Default preset for new chats'}: ${active.name}`;
            root.querySelector('[data-preset-action="apply"]').textContent = chat ? 'Apply to this chat' : 'Set as new chat default';
            role('scope').textContent = chat ? 'The preset library is shared across chats; applying only changes the current chat, which keeps its own snapshot.'
                : 'You can edit, save and import director presets. Once applied, they are used for new chats where Chuyue is not set up yet; existing chats keep their settings.';
            const presets = catalog();
            if (!presets.some(p => p.id === draft.id)) presets.push({ ...draft, name: `${draft.name} (chat snapshot)` });
            const fingerprint = JSON.stringify(presets.map(p => [p.id, p.name]));
            if (fingerprint !== libraryFingerprint) {
                options(get('selected'), presets.map(p => ({ value: p.id, label: p.name })), draft.id); libraryFingerprint = fingerprint;
            }
            for (const control of root.querySelectorAll('[data-preset-field], [data-preset-action]')) {
                control.disabled = !state || director.busy;
                if (['save', 'copy', 'delete', 'import', 'export-all', 'new'].includes(control.dataset.presetAction) || control.dataset.presetField === 'file') control.disabled ||= !director.presets;
                if (control.dataset.presetAction === 'delete') control.disabled ||= BUILTIN_PRESETS.some(p => p.id === draft.id) || !catalog().some(p => p.id === draft.id);
            }
        } catch (e) { role('notice').textContent = e.message; }
    }
    function imported(text) {
        const items = director.presets.importJSON(text);
        libraryFingerprint = ''; refresh();
        role('notice').textContent = `Imported ${items.length} presets; choose and apply one for it to take effect.`;
    }
    const change = async event => {
        const key = event.target.dataset.presetField;
        try {
            if (key === 'selected') {
                draft = { ...(catalog().find(p => p.id === get('selected').value) || draft) };
                refresh(); paint(); role('notice').textContent = director.state() ? 'Loaded into the editor; takes effect after clicking "Apply to this chat".' : 'Loaded into the editor; takes effect after clicking "Set as new chat default".';
            } else if (key === 'file' && event.target.files?.[0]) {
                const file = event.target.files[0], origin = director.state()?.owner;
                try {
                    if (file.size > 1500000) throw new Error('Preset files cannot exceed 1.5 MB');
                    const source = await file.text();
                    if (disposed || director.state()?.owner !== origin) return;
                    imported(source);
                } finally { event.target.value = ''; }
            } else if (['name', 'generatorPrompt', 'injectionTemplate'].includes(key)) {
                draft[key] = event.target.value;
            }
        } catch (e) { role('notice').textContent = e.message; }
    };
    const click = event => {
        const action = event.target.closest('[data-preset-action]')?.dataset.presetAction;
        if (!action) return;
        try {
            if (action === 'new') {
                draft = { ...DEFAULT_PRESET, id: 'new', name: 'New director preset' }; libraryFingerprint = '';
                refresh(); paint(); get('name').focus(); role('notice').textContent = 'New draft created; change the name and prompts, then click "Save preset".';
            } else if (action === 'apply') {
                director.applyPreset(read()); refresh(); role('notice').textContent = director.state() ? 'Preset applied. New event pools use the new rules; prepared events and regenerations keep the original template.' : 'Saved the default preset for new chats; existing chats are unchanged.';
            } else if (action === 'save' || action === 'copy') {
                draft = director.presets.save(read(), action === 'copy'); libraryFingerprint = '';
                director.applyPreset(draft); refresh(); paint(); role('notice').textContent = `Saved and applied: ${draft.name}`;
            } else if (action === 'reset') {
                director.applyPreset(DEFAULT_PRESET); refresh(); role('notice').textContent = 'Restored the default preset; the custom preset library is kept.';
            } else if (action === 'delete') {
                director.presets.remove(draft.id); draft = activePreset(director.settingsState()?.directorPreset);
                libraryFingerprint = ''; refresh(); paint(); role('notice').textContent = 'Deleted from the preset library; saved standalone snapshots can still be used.';
            } else if (action === 'export' || action === 'export-all') {
                get('json').value = director.presets.exportJSON(action === 'export' ? read() : null);
                role('notice').textContent = 'JSON written to the text box below; copy or download it.';
            } else if (action === 'import') get('file').click();
            else if (action === 'download') {
                const data = get('json').value || director.presets.exportJSON(read());
                const url = URL.createObjectURL(new Blob([data], { type: 'application/json;charset=utf-8' }));
                const link = doc.createElement('a'); link.href = url; link.download = 'random-event-director-presets.json';
                root.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        } catch (e) { role('notice').textContent = e.message; }
    };
    root.addEventListener('change', change); root.addEventListener('click', click); refresh();
    return { refresh, dispose() { disposed = true; root.removeEventListener('change', change); root.removeEventListener('click', click); root.remove(); } };
}
