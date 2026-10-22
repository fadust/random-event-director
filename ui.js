import { CURRENT_VERSION } from './updates.js';
import { settingHelp } from './settings-layout.js';

export function mountUI(director, context, doc = document) {
    const host = doc.querySelector('#extensions_settings2') || doc.querySelector('#extensions_settings');
    if (!host) return null;
    doc.querySelector('#random_event_director_panel')?.remove();
    const root = doc.createElement('details');
    root.id = 'random_event_director_panel'; root.className = 'red-panel';
    root.innerHTML = `<summary>Random Event Director <small>V${CURRENT_VERSION}</small></summary>
      <div class="red-body">
      <p class="red-help" data-role="settings-scope"></p>
      <section class="red-settings-section" data-role="story-settings" hidden><h3>Dusk · plot mode</h3><div class="red-settings-content">
        <p class="red-help" data-role="story-index-status"></p>
        <div class="red-setting-row"><label><input type="checkbox" data-setting="storyManual"> Turn off auto-roll</label>
        ${settingHelp('Plot mode auto-roll', '<p>By default the next segment is prepared automatically when this plot segment completes. When ticked it waits for you to roll again; it also stops after a manual end.</p>')}</div>
        <div class="red-actions"><button type="button" class="menu_button" data-action="story-index">Rebuild plot index</button><button type="button" class="menu_button" data-action="story-end">End current plot</button></div>
        ${settingHelp('Plot World Info', '<p>Read it manually the first time; the secondary AI labels every linked entry, including disabled ones, with a plot date or time range. When generating a pool, nearby plot is read if the story has a date; without a date the current main prompt is previewed automatically and the pool is generated from the plot or volume actually injected. Characters and basic settings are used as general material.</p><p>Without a date the prompt preview is used automatically, so there is no need to turn on "Prompt reference", and no main AI request is sent. The preview is subject to the read length cap; if assembly fails it stops and shows why. EJS is only recognized, never executed. Read again after an old stage index or a World Info entry change.</p>')}
      </div></section>
      <section class="red-settings-section"><h3>Triggers and progression</h3><div class="red-settings-content">
        <label class="red-primary-toggle"><input type="checkbox" data-setting="enabled"> <span data-role="enabled-label">Turn on Random Event Director for this chat</span></label>
        <div class="red-setting-row"><label><input type="checkbox" data-setting="progressionMode"> Ongoing event mode</label>
        ${settingHelp('Ongoing event mode', '<p>First draw and confirm an opening event. After a successful main chat reply, a related pool is generated and a follow-up is drawn automatically; each follow-up lasts 3 successful reply rounds, then the pool is regenerated and the next one drawn. 5 follow-up events by default, and you can end it at any time.</p><p>Reuses the selected director preset; failures, regenerations and pauses do not advance the count, and this mode pauses probability and fixed-round auto-draws.</p>')}</div>
        <div class="red-setting-field red-conditional-setting" data-role="progression-settings" hidden><label class="red-column">Follow-up events<input class="text_pole" type="number" min="1" max="20" data-setting="progressionCycles"></label></div>
        <div class="red-setting-row"><label><input type="checkbox" data-setting="fixedRoundEnabled"> Fixed-round random</label>
        ${settingHelp('Fixed-round random', '<p>Triggers every set number of rounds; when off, probability triggering returns. Counted after a full reply; regenerations and background requests are not counted twice.</p>')}</div>
        <div class="red-setting-field red-conditional-setting" data-role="fixed-rounds" hidden><label class="red-column">Fixed round count<input class="text_pole" type="number" min="1" max="100" data-setting="fixedRoundInterval"></label><p class="red-help" data-role="fixed-progress"></p></div>
        <label class="red-column">Random event probability (%)<input class="text_pole" type="number" min="0" max="100" data-setting="triggerProbability"></label>
      </div></section>
      <section class="red-settings-section"><h3>Context and reference</h3><div class="red-settings-content">
        <label class="red-column">Recent messages<input class="text_pole" type="number" min="1" max="40" data-setting="contextMessages"></label>
        <div class="red-setting-row"><label><input type="checkbox" data-setting="includeHiddenMessages"> Read hidden messages</label>
        ${settingHelp('Read hidden messages', '<p>Later event generation and side-window discussion also read hidden messages, still limited by the recent message count and length cap. The main chat\'s hidden state is unchanged.</p>')}</div>
        <div class="red-setting-row"><label><input type="checkbox" data-setting="useMainPromptContext"> Prompt reference</label>
        ${settingHelp('Prompt reference', '<p>Before preparing the event pool and directed candidates, simulate one empty send to read the currently assembled World Info, memory and story prompts, then pass them to the secondary AI to generate events. No need to send a chat message first, and no main AI reply is generated.</p><p>Only the text of the assembled result is used, within the length cap; unsent drafts in the input box are not included. If reading fails it pauses for you to retry. Supports Chat Completion and Text Completion; other extensions may also run during the simulated assembly.</p>')}</div>
        <p class="red-help red-inline-status" data-role="main-prompt-status"></p>
      </div></section>
      <section class="red-settings-section"><h3>Display and injection</h3><div class="red-settings-content">
        <label><input type="checkbox" data-setting="hideDice"> Hide floating die</label>
        <label class="red-column">Event injection mode<select class="text_pole" data-setting="injectionMode">
        <option value="user">Existing mode · with the user message</option>
        <option value="system">Compatible mode · standalone system message</option>
        <option value="force">Force injection · every generation request</option>
        </select></label>
        ${settingHelp('Event injection mode', '<p>Compatible mode uses a standalone system message. Force mode adds this round\'s pending event to every identifiable generation request, including background, retry and unknown-type requests; the round ends after a successful full reply. Cannot be switched during generation.</p>')}
      </div></section>
      <details class="red-advanced"><summary>Advanced settings<small>Event pool · rounds · timeout</small></summary><div class="red-settings-grid">
        <div class="red-setting-field"><label class="red-column">Event pool target size<input class="text_pole" type="number" min="1" max="20" data-setting="targetCount"></label></div>
        <div class="red-setting-field"><label class="red-column">Event pool refresh limit (rounds)<input class="text_pole" type="number" min="5" max="10" data-setting="expiryTurns"></label>
        ${settingHelp('Event pool refresh limit', '<p>Each event pool picks a refresh round at random between 5 rounds and the limit set here, refreshing at most every 10 rounds.</p><p>If used up before then it is not refilled automatically, and rolling does not refill it early; you can refresh the pool by hand. At expiry unused candidates are refreshed too, and drawn events are kept.</p>')}</div>
        <div class="red-setting-field"><label class="red-column">Major event duration (rounds)<input class="text_pole" type="number" min="1" max="20" data-setting="majorEventTurns"></label>
        ${settingHelp('Major event duration (rounds)', '<p>Lasts 5 successful reply rounds by default, using the related event pool, and the last round tries to close naturally. After expiry or a manual end, the regular pool returns.</p><p>Failures and regenerations of the same round are not counted twice. Changing the duration only affects major events drawn afterwards.</p>')}</div>
        <div class="red-setting-field"><div class="red-setting-row"><label for="red-ai-timeout">Secondary AI timeout (seconds)</label><label><input type="checkbox" data-setting="unlimitedGenerationTime"> No time limit</label></div>
        <input id="red-ai-timeout" class="text_pole" type="number" min="5" max="600" data-setting="timeoutSeconds">
        ${settingHelp('Secondary AI generation time', '<p>"No time limit" is ticked by default: it waits for generation to finish and you can stop it by hand. Untick it to limit by the seconds entered, from 5 to 600.</p><p>Applies to event generation, side-window discussion and the first World Info read; the API service\'s own timeout still applies.</p>')}</div>
        <div class="red-setting-row red-setting-wide"><label><input type="checkbox" data-setting="outgoingInjection"> Enhanced event injection</label>
        ${settingHelp('Enhanced event injection', '<p>For the first two injection modes: before sending, restore this round\'s event if missing and tidy duplicate copies, keeping other extensions\' content. Turn off if a special preset is incompatible.</p><p>Force mode always writes the event, regardless of this switch.</p>')}</div>
      </div></details>
      <div data-role="connection-host"></div>
      <div data-role="current-model" class="red-current-model"><div class="red-setting-row"><label><input type="checkbox" data-setting="useCurrentModel"> Use the main API's current model</label>
      ${settingHelp('Use the main API\'s current model', '<p>Uses the main API\'s connection; untick to pick another model on the same API without entering a separate API URL and key.</p>')}</div>
      <label class="red-column">Secondary AI model<input class="text_pole" data-setting="model" list="red-models" placeholder="Choose an existing model or enter a model ID on the same API"></label>
      <datalist id="red-models"></datalist>
      </div>
      <div data-role="header-host"></div>
      <div data-role="preset-host"></div>
      <details><summary>Extra worldbuilding (optional)</summary><textarea class="text_pole" rows="4" data-setting="worldNotes" placeholder="The secondary AI reads the character description, personality, scenario and recent dialogue automatically. Add key World Info settings here."></textarea></details>
      <p data-role="count"></p><p data-role="pending"></p><p data-role="recent"></p>
      <div class="red-actions"><button class="menu_button" type="button" data-action="roll">Roll now</button>
      <button class="menu_button" type="button" data-action="generate">Generate / regenerate event pool</button></div>
      <details data-role="pool"><summary>View event pool (may spoil)</summary><div data-role="events"></div></details>
      <p data-role="status" aria-live="polite"></p>
      </div>`;
    host.append(root);
    const connectionUI = mountConnectionUI(root.querySelector('[data-role="connection-host"]'), director, doc);
    root.querySelector('[data-connection-role="own"]').after(root.querySelector('[data-role="current-model"]'));
    const headerUI = mountHeaderUI(root.querySelector('[data-role="header-host"]'), director, context, doc);
    const presetUI = mountPresetUI(root.querySelector('[data-role="preset-host"]'), director, context, doc);
    let notice = '', lastOwner = null, workspace;
    const field = name => root.querySelector(`[data-role="${name}"]`);
    function refresh() {
        let s, chat;
        try { chat = director.state(); s = director.settingsState(); } catch (e) { field('status').textContent = e.message; return; }
        field('settings-scope').textContent = chat ? 'Editing settings for the current chat.' : 'No chat open: you can configure the API and presets; the options below are saved as defaults for new chats and do not change existing chats.';
        field('enabled-label').textContent = chat ? 'Turn on Random Event Director for this chat' : 'Turn on Random Event Director by default for new chats';
        root.classList.toggle('red-dusk', Boolean(s?.storyMode));
        field('story-settings').hidden = !s?.storyMode;
        field('story-index-status').textContent = director.fill?.kind === 'story-index' ? 'Reading the whole World Info and labeling plot times…' : chat?.storyIndex?.version === 2
            ? `Time index ${chat.storyIndex.keys.length} entries · ${chat.storyDate || chat.storyReferenceLabel || 'Uses the current prompt when undated'}${chat.storyEpisode ? ` · 已展开 ${chat.storyEpisode.turns} rounds` : ''}` : chat?.storyIndex ? 'The old stage index needs to be read again to label plot times.' : 'No time index yet; read the World Info manually first.';
        root.querySelector('[data-action="story-index"]').textContent = chat?.storyIndex?.version === 2 ? 'Rebuild time index' : 'Read World Info';
        field('progression-settings').hidden = !s?.progressionMode;
        if (s?.owner !== lastOwner) { notice = ''; lastOwner = s?.owner; }
        if (!s?.pendingEvent && notice === 'A random event is ready and takes effect on the next normal generation.') notice = '';
        connectionUI.refresh();
        for (const el of root.querySelectorAll('[data-setting]')) {
            const name = el.dataset.setting;
            el.disabled = !s || (name === 'model' && s.useCurrentModel) || (name === 'triggerProbability' && (s.fixedRoundEnabled || s.progressionMode))
                || (name === 'timeoutSeconds' && s.unlimitedGenerationTime)
                || (['fixedRoundEnabled', 'fixedRoundInterval'].includes(name) && s.progressionMode)
                || (['injectionMode', 'useMainPromptContext', 'progressionMode'].includes(name) && director.busy);
            if (el.type === 'checkbox') el.checked = Boolean(s?.[name]);
            else if (doc.activeElement !== el) el.value = s?.[name] ?? '';
        }
        field('fixed-rounds').hidden = !s?.fixedRoundEnabled;
        field('main-prompt-status').hidden = !s?.useMainPromptContext;
        field('main-prompt-status').textContent = director.mainPromptSnapshot()
            ? 'The current prompt was captured recently; it is read again the next time candidates are generated.'
            : 'The current prompt is read automatically when preparing event candidates; no need to send a chat message first.';
        field('fixed-progress').textContent = chat ? `Progress ${chat.fixedRoundProgress} / ${s.fixedRoundInterval} rounds`
            : 'New chats count from the first round.';
        field('count').textContent = chat ? `Available event pool: ${chat.eventPool.length} / ${chat.targetCount}${director.fill ? ' · secondary AI generating…' : ''}` : 'Open a chat before generating events.';
        field('pending').textContent = chat?.pendingEvent ? (chat.progressionMode && !chat.pendingEvent.confirmed
            ? 'An event was drawn; confirm it on the Random events page or the die side window to use it.' : 'A random event is ready and takes effect on the corresponding next normal generation.') : 'No pending event.';
        field('recent').textContent = `Last triggered: ${chat?.recentEvent?.title || 'None yet'}`;
        field('status').textContent = chat?.error || notice || (chat?.refillStopped && !director.fill && !director.discussion?.guideTask ? 'Event generation is paused; use the generate button or "Retry generation" in the dice window.' : '');
        for (const button of root.querySelectorAll('[data-action]')) button.disabled = !chat?.enabled || director.busy || Boolean(director.fill);
        for (const name of ['progressionMode', 'fixedRoundEnabled', 'fixedRoundInterval', 'triggerProbability']) {
            const control = root.querySelector(`[data-setting="${name}"]`); if (control && s?.storyMode) control.disabled = true;
        }
        root.querySelector('[data-action="story-index"]').disabled = !chat || director.busy || Boolean(director.fill || chat.storyEpisode || director.discussion?.chatTask);
        root.querySelector('[data-action="story-end"]').disabled ||= !chat?.storyEpisode;
        const list = root.querySelector('#red-models'); list.replaceChildren();
        const models = new Set();
        for (const select of doc.querySelectorAll('select[id*="model"]')) for (const option of select.options) {
            if (option.value && !option.disabled) models.add(option.value);
        }
        for (const model of models) { const option = doc.createElement('option'); option.value = model; list.append(option); }
        if (field('pool').open) showEvents(chat);
        field('current-model').hidden = director.connection?.read().mode === 'independent';
        headerUI.refresh();
        presetUI.refresh();
        workspace?.refresh();
    }
    function showEvents(s) {
        const list = field('events'); list.replaceChildren();
        for (const event of [...(s?.pendingEvent ? [s.pendingEvent.event] : []), ...(s?.eventPool || [])]) {
            const item = doc.createElement('article'), title = doc.createElement('strong'), meta = doc.createElement('small'), content = doc.createElement('p');
            title.textContent = event.title;
            meta.textContent = `Type: ${event.type} · Weight: ${event.weight} · ${event.status === 'pending' ? 'Pending' : 'Available'}`;
            content.textContent = event.content; item.append(title, meta, content); list.append(item);
        }
        if (!list.childElementCount) list.textContent = 'No events yet.';
    }
    const onChange = event => {
        const el = event.target, name = el.dataset.setting;
        if (!name) return;
        notice = '';
        try { director.update({ [name]: el.type === 'checkbox' ? el.checked : el.value }); refresh(); }
        catch (e) { director.fail(e); }
    };
    const onClick = async event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        const owner = director.state()?.owner;
        try {
            notice = '';
            const task = action === 'story-index' ? director.story.prepare({ replace: true, manual: true, rebuild: true, indexOnly: true })
                : action === 'story-end' ? director.story.end() : action === 'roll' ? director.rollNow() : director.refill(true);
            refresh();
            const done = await task;
            if (director.state()?.owner !== owner) { refresh(); return; }
            const state = director.state();
            notice = done ? (action === 'story-index' ? 'Plot index saved in full.' : action === 'story-end' ? 'The current plot has ended; waiting for the next roll.' : action === 'roll' ? 'A random event is ready and takes effect on the next normal generation.' : 'Event pool updated.')
                : state?.poolGenerated && !state.eventPool.length && !state.discussion.guide && !state.refillStopped
                    ? 'The event pool is used up; wait for the refresh round, or refresh it by hand.' : 'No new event prepared this time; normal chat can continue.';
        } catch (e) { director.fail(e); }
        refresh();
    };
    const onInput = event => {
        const el = event.target;
        if (el.dataset.setting === 'fixedRoundInterval' && el.value !== '' && el.validity.valid) onChange(event);
    };
    root.addEventListener('change', onChange); root.addEventListener('input', onInput); root.addEventListener('click', onClick);
    field('pool').addEventListener('toggle', refresh);
    workspace = mountWorkspace(director, context, root, host, doc);
    refresh();
    return { refresh, dispose() { workspace.dispose(); connectionUI.dispose(); headerUI.dispose(); presetUI.dispose(); root.removeEventListener('change', onChange); root.removeEventListener('input', onInput); root.removeEventListener('click', onClick); root.remove(); } };
}
import { mountPresetUI } from './preset-ui.js';
import { mountConnectionUI } from './connection-ui.js';
import { mountHeaderUI } from './header-ui.js';
import { mountWorkspace } from './workspace-ui.js';
