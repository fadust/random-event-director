import { activeHeader, nativePreset, nativeHeaderReference, builtinHeaderReference, BUILTIN_HEADER_TEXT } from './headers.js';
import { completionPresets } from './api.js';

export function mountHeaderUI(host, director, context, doc) {
    host.innerHTML = `<details class="red-headers"><summary>Secondary AI header preset</summary><div class="red-body">
      <p data-header-role="active"></p><label class="red-column">Header mode<select class="text_pole" data-header="mode">
      <option value="builtin">Use Chuyue's header</option><option value="native">Use a SillyTavern preset</option><option value="none">No header</option></select></label>
      <p class="red-help" data-header-role="help"></p>
      <details data-header-role="builtin" hidden><summary>View Chuyue's header content</summary><textarea class="text_pole" rows="6" readonly aria-label="Chuyue header content"></textarea></details>
      <div data-header-role="native" hidden><label class="red-column">Choose SillyTavern preset<select class="text_pole" data-header="selected"></select></label>
      <p class="red-help">Reuses the SillyTavern preset's enabled prompts, without temperature, sampling, reasoning effort, output length or similar parameters. Add and edit presets in SillyTavern; the API connection is configured separately.</p>
      <button type="button" class="menu_button" data-header-action="refresh">Refresh SillyTavern preset list</button></div>
      <div class="red-actions"><button type="button" class="menu_button" data-header-action="apply">Apply header preset</button></div>
      <p data-header-role="notice" aria-live="polite"></p></div></details>`;
    const root = host.querySelector('.red-headers'), select = root.querySelector('[data-header="selected"]');
    const modeSelect = root.querySelector('[data-header="mode"]');
    root.querySelector('[aria-label="Chuyue header content"]').value = BUILTIN_HEADER_TEXT;
    const notice = text => { root.querySelector('[data-header-role="notice"]').textContent = text; };
    let mode = 'builtin', selected = '', owner = null, serial = '', catalogKey = '', disposed = false;
    function showMode() {
        const scope = director.state() ? 'for the current chat' : 'saved as the default for new chats';
        modeSelect.value = mode;
        root.querySelector('[data-header-role="native"]').hidden = mode !== 'native';
        root.querySelector('[data-header-role="builtin"]').hidden = mode !== 'builtin';
        root.querySelector('[data-header-role="help"]').textContent = mode === 'builtin'
            ? `The director header provided by Chuyue, with identity, personality, attitude, mission and greeting, used for story discussion and event generation. Click apply to use it ${scope}.`
            : mode === 'native' ? `Pick an existing SillyTavern preset for story discussion and event generation. Click apply to use it ${scope}.`
                : 'No extra header; Chuyue\'s event generation rules, side-window persona and discussion rules still apply.';
    }
    function refresh() {
        if (disposed) return;
        try {
            const chat = director.state(), state = director.settingsState(), active = activeHeader(state?.headerPreset), next = JSON.stringify(active);
            if (owner !== state?.owner || serial !== next) {
                owner = state?.owner; serial = next; selected = active?.nativePresetName || '';
                mode = active?.builtinHeader ? 'builtin' : active?.nativePresetName ? 'native' : 'none'; catalogKey = ''; notice('');
            }
            const legacy = active && !active.nativePresetName && !active.builtinHeader;
            root.querySelector('[data-header-role="active"]').textContent = legacy
                ? `Still using an old header: ${active.name}. Choose one of the three modes below and apply.`
                : `${chat ? 'Current header' : 'Default header for new chats'}: ${active?.builtinHeader ? active.name : active?.nativePresetName || 'No header'}`;
            showMode();
            // The built-in and disabled modes do not depend on the host's preset catalog.
            const names = mode === 'native' ? completionPresets(context(), 'openai') : [], key = JSON.stringify([names, selected]);
            if (key !== catalogKey) {
                const rows = [{ value: '', name: 'Choose a SillyTavern preset' }, ...names.map(name => ({ value: name, name }))];
                if (selected && !names.includes(selected)) rows.push({ value: selected, name: `${selected} (no longer in SillyTavern)` });
                select.replaceChildren();
                for (const row of rows) { const option = doc.createElement('option'); option.value = row.value; option.textContent = row.name; select.append(option); }
                select.value = selected; catalogKey = key;
            }
            for (const control of root.querySelectorAll('select,button')) control.disabled = !state || director.busy;
        } catch (e) { notice(e.message); }
    }
    const change = event => {
        if (event.target === modeSelect) { mode = modeSelect.value; refresh(); }
        else if (event.target === select) selected = select.value;
        else return;
        notice(director.state() ? 'Used for the current chat after clicking "Apply header preset".' : 'Saved as the default header for new chats after clicking "Apply header preset".');
    };
    const click = event => {
        const action = event.target.closest('[data-header-action]')?.dataset.headerAction;
        if (!action) return;
        try {
            if (action === 'refresh') { catalogKey = ''; refresh(); notice('SillyTavern preset list refreshed.'); }
            else if (action === 'apply') {
                const reference = mode === 'builtin' ? builtinHeaderReference() : mode === 'native' ? nativeHeaderReference(selected) : null;
                if (mode === 'native') nativePreset(reference, context());
                director.applyHeader(reference); refresh(); notice(!director.state() ? 'Saved the default header for new chats; existing chats are unchanged.'
                    : mode === 'builtin' ? 'Applied Chuyue\'s header for story discussion and event generation in the current chat.'
                    : mode === 'native' ? 'Applied the SillyTavern preset\'s prompts; generation parameters do not change with the header preset.' : 'Extra header turned off.');
            }
        } catch (e) { notice(e.message); }
    };
    root.addEventListener('change', change); root.addEventListener('click', click); refresh();
    return { refresh, dispose() { disposed = true; root.removeEventListener('change', change); root.removeEventListener('click', click); root.remove(); } };
}
