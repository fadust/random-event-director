import { mountDiagnosticsUI } from './diagnostics-ui.js';
import { makeDraggable, placeWidget, visibleViewport } from './window-placement.js';
import { PERSONAS, PERSONA_PREFERENCES_KEY, discussionPersona, normalizePersona } from './personas.js';
import { mountUpdateUI } from './update-ui.js';
import { CURRENT_VERSION } from './updates.js';
import { foldSettingsHelp } from './settings-layout.js';

const WORKSPACE_KEY = 'random_event_director_workspace_ui_v1';
const WINDOW_SIZES = new Set(['small', 'medium', 'large']);
// A faceted D10 silhouette, not a six-sided pip die. Decorative faces do not represent an event probability roll.
const D10 = `<svg class="red-d10" viewBox="0 0 100 108" aria-hidden="true" focusable="false"><path class="red-die-shadow" d="M50 7 89 38 79 76 50 100 21 76 11 38Z"/><path class="red-die-face red-die-face-top" d="M50 7 11 38 50 29 89 38Z"/><path class="red-die-face red-die-face-left" d="M11 38 21 76 37 63 50 29Z"/><path class="red-die-face red-die-face-center" d="M50 29 37 63 50 89 63 63Z"/><path class="red-die-face red-die-face-right" d="M89 38 79 76 63 63 50 29Z"/><path class="red-die-face red-die-face-bottom" d="M21 76 50 100 79 76 63 63 50 89 37 63Z"/><path class="red-die-edges" d="M50 7 89 38 79 76 50 100 21 76 11 38Z M11 38 50 29 89 38 M50 7V29 M50 29 37 63 21 76 M50 29 63 63 79 76 M37 63 50 89 63 63 M50 89V100"/><text class="red-die-number" x="50" y="64" text-anchor="middle">10</text><path class="red-die-glint" d="M46 17h8 M50 13v8"/></svg>`;

export function mountWorkspace(director, context, settings, settingsHost, doc = document) {
    doc.querySelector('#red_director_window')?.remove(); doc.querySelector('#red_director_entry')?.remove();
    doc.querySelector('#red_director_dice_dock')?.remove();
    doc.querySelector('#red_director_event_window')?.remove();
    const window = doc.createElement('section');
    window.id = 'red_director_window'; window.className = 'red-window'; window.hidden = true;
    window.setAttribute('role', 'dialog'); window.setAttribute('aria-label', 'Director System - Chuyue');
    window.innerHTML = `<header class="red-window-head"><div class="red-window-title"><span class="red-moon" aria-hidden="true">☾</span><div><strong>Director System - Chuyue</strong><small>Talk ideas through, then decide the next scene</small></div></div>
      <div class="red-window-tools"><div class="red-size-switch" role="group" aria-label="Window size"><button type="button" data-size="large" aria-label="Large window" aria-pressed="false">L</button><button type="button" data-size="medium" aria-label="Medium window" aria-pressed="true">M</button><button type="button" data-size="small" aria-label="Small window" aria-pressed="false">S</button></div><button type="button" data-window="maximize" aria-label="Maximize window" title="Maximize / restore">⛶</button><button type="button" data-window="close" aria-label="Close director window" title="Close">×</button></div></header>
      <nav class="red-tabs" aria-label="Director system pages"><button type="button" data-view="chat" aria-pressed="true">Story discussion</button><button type="button" data-view="events" aria-pressed="false">Random events</button><button type="button" data-view="pool" aria-pressed="false">Event pool</button><button type="button" data-view="settings" aria-pressed="false">Settings</button><button type="button" data-view="logs" aria-pressed="false">Diagnostic log</button></nav><div class="red-owner" data-window-role="owner"></div>
      <div class="red-chat-view" data-page="chat"><div class="red-persona-chatbar"><small data-window-role="persona-hint"></small><label>Chat persona <select data-window-role="persona" aria-label="Side-window chat persona"></select></label></div><div class="red-guide-status" data-window-role="guide-status"></div>
        <div class="red-transcript" data-window-role="messages" role="log" aria-label="Director discussion transcript" aria-live="polite"></div>
        <div class="red-proposal" data-window-role="proposal" hidden><div class="red-summary-card"><strong><span aria-hidden="true">✧</span> Direction summary</strong><p data-window-role="summary"></p></div><div class="red-window-actions"><button type="button" data-window="accept">Apply to the next event</button><button type="button" data-window="reject">Don't apply</button></div><small>You can also keep discussing; the previous unconfirmed summary expires automatically.</small></div>
        <p class="red-window-notice" data-window-role="notice" role="status"></p>
        <div class="red-composer"><textarea rows="2" maxlength="4000" aria-label="Director discussion input" placeholder="Describe the direction you want…
Enter to send, Shift+Enter for a new line"></textarea><button type="button" data-window="send" aria-label="Send to director">Send</button><button type="button" data-window="stop" hidden>Stop</button></div>
        <footer class="red-chat-footer"><button type="button" data-window="clear">Clear discussion</button><small>Current chat only · once confirmed, affects one event</small></footer>
      </div><div class="red-events-view" data-page="events" hidden>
        <div class="red-page-heading"><span class="red-eyebrow">The story's next scene</span><h2>Random events</h2><p>A little surprise to move the story along naturally.</p></div>
        <label class="red-event-toggle"><input type="checkbox" data-window-role="enable-events">Turn on random events for this chat</label>
        <aside class="red-major-status" data-major-card hidden><small>Major event</small><strong data-major-role="title"></strong><span data-major-role="turns"></span><button type="button" data-window="end-major">End major event</button></aside>
        <div class="red-event-stats"><div><small>Available events</small><strong data-window-role="event-count"></strong></div><div><small data-window-role="event-trigger-label">Trigger probability</small><strong data-window-role="event-probability"></strong></div></div>
        <div class="red-event-actions"><button type="button" class="red-dice-button" data-window="roll" aria-label="Roll the ten-sided die to enable an event">${D10}<span data-window-role="dice-label">Roll and enable an event</span></button><div class="red-event-pool-actions"><button type="button" data-window="prepare-pool">Prepare / update event pool</button><button type="button" data-window="reroll" title="Discard the pending event and draw again at random from the remaining candidates">Reroll</button></div></div>
        <button type="button" class="red-pool-link" data-view="pool">Full event pool →</button>
        <article class="red-event-card"><div class="red-event-card-label"><span aria-hidden="true">☾</span><span data-window-role="event-label"></span></div><h3 data-window-role="event-title"></h3><p data-window-role="event-hint"></p><details data-window-role="event-reveal" hidden><summary>View event content (may spoil)</summary><p data-window-role="event-content"></p></details><button type="button" data-window="confirm-event" hidden>Confirm and continue</button></article>
        <p class="red-event-notice" data-window-role="event-notice" role="status"></p><small class="red-event-footnote">Clicking the die turns on the current chat and draws an event; it takes effect when you continue the main chat and never sends a message by itself.</small>
        <div class="red-event-recent"><small>Last triggered</small><span data-window-role="event-recent"></span></div><button type="button" class="red-text-button" data-view="settings">Adjust probability, context and presets →</button>
      </div><div class="red-pool-view" data-page="pool" hidden><div class="red-page-heading"><span class="red-eyebrow">Current chat · may spoil</span><h2>Full event pool</h2><p data-window-role="pool-count"></p></div><div class="red-window-actions"><button type="button" data-window="regenerate-pool">Regenerate</button></div><p class="red-help">Regenerating discards the regular candidate pool and generates it again; drawn events are kept.</p><p class="red-event-notice" data-window-role="pool-notice" role="status"></p><div data-window-role="pool-list"></div><button type="button" data-view="events">Back to random events</button></div><div class="red-settings-view" data-page="settings" hidden><div class="red-page-heading"><span class="red-eyebrow">Help Chuyue understand your story</span><h2>Director settings</h2></div><p class="red-settings-intro">Configure the secondary AI, presets and random events. API connections and the preset library can be shared; the current chat's choices are saved separately.</p></div><div class="red-diagnostics-view" data-page="logs" hidden></div>`;
    const diceDock = doc.createElement('div'); diceDock.id = 'red_director_dice_dock';
    diceDock.innerHTML = `<aside class="red-major-status" data-major-card hidden aria-label="Current major event"><small>Major event</small><strong data-major-role="title"></strong><span data-major-role="turns" aria-live="polite"></span><button type="button" data-major-action="end">End major event</button></aside><button type="button" class="red-floating-die" aria-label="Roll the ten-sided die to enable an event">${D10}</button><span class="red-dice-feedback" role="status" aria-live="polite"></span>`;
    const eventWindow = doc.createElement('section'); eventWindow.id = 'red_director_event_window'; eventWindow.hidden = true;
    eventWindow.setAttribute('role', 'dialog'); eventWindow.setAttribute('aria-label', 'This round\'s random event');
    eventWindow.innerHTML = `<header class="red-mini-head"><div class="red-mini-titlebar"><span>☾ <span data-mini="label">This round's random event</span></span><button type="button" data-mini-action="director">Open director system <span aria-hidden="true">↗</span></button><button type="button" data-mini-action="close" aria-label="Close event window">×</button></div><div class="red-mini-toolbar"><label class="red-mini-toggle"><input type="checkbox" data-mini="enabled"> Turn on random events</label><button type="button" class="red-mini-mode-stack" data-mini="dice-mode" data-mini-action="switch-mode" data-mode="pool" aria-label="Switch roll mode, currently Regular roll"><span class="red-mini-mode-card" data-mode-card="pool" aria-hidden="true"><strong>Regular roll</strong><small>Draw from the current event pool</small></span><span class="red-mini-mode-card" data-mode-card="instant" aria-hidden="true"><strong>Instant roll</strong><small>Generate and draw on the spot from the current situation</small></span></button></div></header><div class="red-mini-body"><div class="red-mini-event"><h3 data-mini="title"></h3><p data-mini="hint"></p><details data-mini="reveal" hidden><summary>View event content (may spoil)</summary><p data-mini="content"></p></details><p data-mini="notice" role="status" aria-live="polite"></p><div class="red-mini-failure-actions" data-mini="failure-actions" hidden><button type="button" data-mini-action="retry">Retry generation</button><button type="button" data-mini-action="logs">View log</button></div></div></div><footer><button type="button" data-mini-action="roll">Click to roll</button></footer>`;
    const confirmMini = doc.createElement('button'); confirmMini.type = 'button'; confirmMini.dataset.miniAction = 'confirm-event';
    confirmMini.textContent = 'Confirm and continue'; confirmMini.hidden = true;
    eventWindow.querySelector('.red-mini-event').append(confirmMini);
    const storySwitch = doc.createElement('button'); storySwitch.type = 'button'; storySwitch.className = 'red-story-mode-switch';
    storySwitch.dataset.miniAction = 'story-mode'; storySwitch.textContent = 'Plot mode';
    eventWindow.querySelector('.red-mini-toolbar').append(storySwitch);
    const storyHeadSwitch = storySwitch.cloneNode(true); storyHeadSwitch.removeAttribute('data-mini-action');
    window.querySelector('.red-window-tools').prepend(storyHeadSwitch);
    const storyIntro = doc.createElement('dialog'); storyIntro.id = 'red_story_intro';
    storyIntro.setAttribute('aria-labelledby', 'red_story_intro_title');
    storyIntro.innerHTML = `<h3 id="red_story_intro_title">Dusk begins by understanding the world</h3><p>On first use or when upgrading an old index, the linked World Info is given to the secondary AI to read and label with plot dates. After that, nearby plot is read when the story has a time; without one, the plot actually injected in the current prompt is used. General settings are always kept.</p><p data-story-intro-status role="status" aria-live="polite"></p><div><button type="button" data-story-intro="later">Read later</button><button type="button" data-story-intro="read">Read World Info</button></div>`;
    doc.body.append(storyIntro);
    const introRead = storyIntro.querySelector('[data-story-intro="read"]');
    const introStatus = storyIntro.querySelector('[data-story-intro-status]');
    function showStoryIntro() {
        const state = director.state();
        if (disposed || !director.settingsState()?.storyMode || state?.storyIndex?.version === 2) return;
        introStatus.textContent = state ? 'The secondary AI is only called after you click Read; roll for plot once reading finishes.' : 'Open a character chat first, then read its linked World Info.';
        introRead.disabled = !state || director.busy || Boolean(director.fill);
        if (!storyIntro.open) { if (storyIntro.showModal) storyIntro.showModal(); else storyIntro.setAttribute('open', ''); }
    }
    const closeStoryIntro = () => { if (storyIntro.close) storyIntro.close(); else storyIntro.removeAttribute('open'); };
    storyIntro.querySelector('[data-story-intro="later"]').addEventListener('click', closeStoryIntro);
    introRead.addEventListener('click', async () => {
        const owner = director.state()?.owner; introRead.disabled = true; introStatus.textContent = 'Reading the World Info and labeling plot times…';
        try {
            const done = await director.story.prepare({ replace: true, manual: true, rebuild: true, indexOnly: true });
            if (disposed || director.state()?.owner !== owner) return;
            if (done) { eventNotice = 'World Info time index saved; roll to start the plot.'; closeStoryIntro(); }
            else introStatus.textContent = director.state()?.error || 'Cannot read right now; end the running task and retry.';
        } catch (error) { introStatus.textContent = error.message; }
        finally { if (!disposed) { introRead.disabled = director.busy || Boolean(director.fill); refresh(); } }
    });
    director.requestStoryReading = showStoryIntro;
    const toggleStory = () => {
        try { director.update({ storyMode: !director.settingsState()?.storyMode }); eventNotice = ''; }
        catch (error) { eventNotice = error.message; }
        refresh();
        if (director.settingsState()?.storyMode) showStoryIntro(); else closeStoryIntro();
    };
    storyHeadSwitch.addEventListener('click', toggleStory);
    const miniToggle = eventWindow.querySelector('.red-mini-toggle');
    miniToggle.addEventListener('pointerdown', event => event.stopPropagation());
    doc.body.append(window, diceDock, eventWindow);
    const floatingDie = diceDock.querySelector('.red-floating-die'), diceFeedback = diceDock.querySelector('.red-dice-feedback');
    for (const die of [floatingDie, window.querySelector('[data-window="roll"]')]) die.setAttribute('aria-label', 'Open the dice event window');
    const entry = doc.createElement('div'); entry.id = 'red_director_entry'; entry.className = 'inline-drawer red-extension-entry';
    entry.innerHTML = `<div class="inline-drawer-toggle inline-drawer-header"><b>Director System - Chuyue <small>V${CURRENT_VERSION}</small></b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content" style="display: none;"><p>Discuss the story with Chuyue, or set up random events.</p><div class="red-entry-actions"><button class="menu_button menu_button_icon" type="button" data-launch="chat">Open director system</button><button class="menu_button menu_button_icon" type="button" data-launch="events">Random events</button><button class="menu_button menu_button_icon" type="button" data-launch="settings">Director settings</button><button class="menu_button menu_button_icon" type="button" data-launch="logs">Diagnostic log</button></div></div>`;
    settingsHost.append(entry); window.querySelector('[data-page="settings"]').append(settings); settings.open = true;
    const get = name => window.querySelector(`[data-window-role="${name}"]`);
    const personaSettings = doc.createElement('div'); personaSettings.className = 'red-persona-settings';
    personaSettings.innerHTML = '<label>Default persona for new chats<select data-window-role="default-persona" aria-label="Default persona for new chats"></select></label><p class="red-help">Only affects the side-window chat tone. For the current chat, choose at the top right of the story discussion page; the default only applies to new chats without a persona set.</p>';
    window.querySelector('[data-page="settings"]').insertBefore(personaSettings, settings);
    const updateUI = mountUpdateUI(window, entry, context, doc);
    settings.after(window.querySelector('.red-update-settings'));
    foldSettingsHelp(window.querySelector('[data-page="settings"]'));
    for (const select of [get('persona'), get('default-persona')]) for (const persona of PERSONAS) {
        const option = doc.createElement('option'); option.value = persona.id; option.textContent = persona.name; select.append(option);
    }
    const button = name => window.querySelector(`[data-window="${name}"]`);
    const input = window.querySelector('textarea[aria-label="Director discussion input"]');
    const diagnosticsUI = mountDiagnosticsUI(window.querySelector('[data-page="logs"]'), director.diagnostics, doc);
    let page = 'chat', owner = null, notice = '', eventNotice = '', pendingId = null, transcriptKey = '', poolKey = '', lastFocus = null;
    let disposed = false, eventTask = null, diceAnimating = false, diceTimer = null, animationUntil = 0, shownFailureId = null;
    const mini = name => eventWindow.querySelector(`[data-mini="${name}"]`);
    function constrainEventWindow() { return doc.defaultView.matchMedia('(max-width: 600px), (pointer: coarse)').matches; }
    function reflow() {
        for (const widget of [window, diceDock]) placeWidget(widget);
        placeWidget(eventWindow, undefined, { constrain: constrainEventWindow() });
    }
    function setSize(size, persist = false) {
        if (!WINDOW_SIZES.has(size)) return;
        window.dataset.size = size; window.classList.remove('red-maximized');
        for (const property of ['width', 'height', 'left', 'top', 'right', 'bottom']) window.style.removeProperty(property);
        for (const item of window.querySelectorAll('[data-size]')) item.setAttribute('aria-pressed', String(item.dataset.size === size));
        button('maximize').setAttribute('aria-label', 'Maximize window');
        if (!window.hidden) placeWidget(window);
        if (persist) {
            const ctx = context();
            if (ctx.extensionSettings) { ctx.extensionSettings[WORKSPACE_KEY] = { size }; ctx.saveSettingsDebounced?.(); }
        }
    }
    setSize(context().extensionSettings?.[WORKSPACE_KEY]?.size || 'medium');
    function view(name) {
        page = name;
        for (const panel of window.querySelectorAll('[data-page]')) panel.hidden = panel.dataset.page !== page;
        for (const tab of window.querySelectorAll('.red-tabs [data-view]')) tab.setAttribute('aria-pressed', String(tab.dataset.view === page));
        if (page === 'logs') diagnosticsUI.refresh();
    }
    function open(name = 'chat') {
        if (name === 'chat' && !director.state()) name = 'settings';
        lastFocus = doc.activeElement; window.hidden = false; view(name); refresh(); placeWidget(window);
        updateUI.opened();
        if (name === 'chat' && !doc.defaultView.matchMedia('(pointer: coarse)').matches) input.focus();
    }
    function showEvent() {
        const wasHidden = eventWindow.hidden; eventWindow.hidden = false; refresh();
        positionEvent(wasHidden);
    }
    function positionEvent(wasHidden) {
        const rect = diceDock.getBoundingClientRect(), width = eventWindow.getBoundingClientRect().width, viewport = visibleViewport(doc.defaultView);
        const beside = rect.left - width - 8 >= viewport.left + 8;
        placeWidget(eventWindow, wasHidden ? { left: beside ? rect.left - width - 8 : viewport.left + 8,
            top: beside ? rect.top : viewport.top + 8 } : undefined);
    }
    function renderPool(state) {
        const pending = state?.pendingEvent?.event;
        const candidates = state?.eventPool || [], guided = (state?.discussion?.guide?.pool || []).filter(item => item.id !== pending?.id);
        get('pool-count').textContent = `Drawn ${pending ? 1 : 0} · ${state?.majorEvent ? 'Major-event candidates' : 'Regular candidates'} ${candidates.length} · directed candidates this time ${guided.length}`;
        const key = JSON.stringify([state?.owner, pending, candidates, guided, state?.majorEvent?.id]);
        if (key === poolKey) return;
        poolKey = key; const list = get('pool-list'); list.replaceChildren();
        for (const [label, events] of [['Drawn · waiting for this round', pending ? [pending] : []], [state?.majorEvent ? 'Major-event pool' : 'Regular event pool', candidates], ['This discussion\'s direction · applies once', guided]]) {
            if (!events.length) continue;
            const heading = doc.createElement('h3'); heading.textContent = label; list.append(heading);
            for (const event of events) {
                const detail = doc.createElement('details'), title = doc.createElement('summary'), content = doc.createElement('p');
                title.textContent = `${event.severity === 'major' ? 'Major · ' : ''}${event.title}`; content.textContent = event.content; detail.append(title, content); list.append(detail);
            }
        }
        if (!list.childNodes.length) { const empty = doc.createElement('p'); empty.textContent = state ? 'The event pool is empty. Prepare events on the random events page, or just click the die.' : 'Open a chat first.'; list.append(empty); }
    }
    function refresh() {
        const state = director.state(), disc = state?.discussion, currentOwner = state?.owner || null;
        const storyActive = Boolean(director.settingsState()?.storyMode);
        for (const surface of [window, eventWindow, diceDock]) surface.classList.toggle('red-dusk', storyActive);
        window.querySelector('[data-page="events"] .red-page-heading h2').textContent = storyActive ? 'Dusk plot' : 'Random events';
        window.querySelector('[data-page="events"] .red-page-heading p').textContent = storyActive ? 'Understand the world and let a story unfold slowly.' : 'A little surprise to move the story along naturally.';
        for (const control of [storySwitch, storyHeadSwitch]) {
            control.textContent = storyActive ? 'Plot mode ☀' : 'Random mode ☾';
            control.title = storyActive ? 'Switch back to random mode (discards the current pool and plot)' : 'Switch to dusk plot mode (discards the current pool and events)';
            control.setAttribute('aria-pressed', String(storyActive)); control.disabled = director.busy;
        }
        if (owner !== currentOwner) { owner = currentOwner; shownFailureId = null; input.value = ''; notice = ''; eventNotice = ''; transcriptKey = ''; pendingId = null; get('event-reveal').open = false; eventWindow.hidden = true; mini('reveal').open = false; }
        const ctx = context(); get('owner').textContent = state ? `${ctx.name2 || 'Current character'} · current chat` : 'No chat open · configuring defaults for new chats';
        const persona = discussionPersona(disc?.persona);
        get('persona').value = persona.id; get('persona').disabled = !state || Boolean(director.discussion?.chatTask);
        get('persona-hint').textContent = persona.description;
        get('default-persona').value = normalizePersona(ctx.extensionSettings?.[PERSONA_PREFERENCES_KEY]?.defaultPersona);
        get('default-persona').disabled = !ctx.extensionSettings;
        input.placeholder = `Describe the direction you want, or ask ${persona.name} for suggestions…
Enter to send, Shift+Enter for a new line`;
        const key = JSON.stringify([disc?.messages, disc?.persona, Boolean(director.discussion?.chatTask)]);
        if (key !== transcriptKey) {
            transcriptKey = key; const log = get('messages'); log.replaceChildren();
            if (!disc?.messages.length) {
                const intro = doc.createElement('div'); intro.className = 'red-chat-intro';
                intro.innerHTML = `<span class="red-intro-moon" aria-hidden="true">${persona.mark}</span><strong>Think about the story's next step with ${persona.name}</strong><p>Describe the mood, change or no-gos you want. If you have no ideas, ${persona.name} can make suggestions too.</p><button type="button" data-starter="What could happen next? Give me a few natural directions.">What could happen next?</button><button type="button" data-starter="Help me sort out the current story, then suggest a fitting small change.">Help me sort out the story</button>`; log.append(intro);
            }
            for (const message of disc?.messages || []) {
                const bubble = doc.createElement('article'); bubble.className = `red-bubble red-${message.role}`;
                const author = doc.createElement('small'), text = doc.createElement('p'), avatar = doc.createElement('span'), body = doc.createElement('div');
                const speaker = message.persona ? discussionPersona(message.persona) : null;
                avatar.className = 'red-chat-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = message.role === 'user' ? 'You' : speaker?.mark || '☾'; body.className = 'red-bubble-body';
                author.textContent = message.role === 'user' ? 'You' : speaker?.name || 'Chuyue'; text.textContent = message.content;
                body.append(author, text); bubble.append(avatar, body); log.append(bubble);
            }
            if (director.discussion?.chatTask) { const thinking = doc.createElement('p'); thinking.className = 'red-thinking'; thinking.textContent = `${persona.name} is thinking…`; log.append(thinking); }
            log.scrollTop = log.scrollHeight;
        }
        const guideStatus = get('guide-status'); guideStatus.replaceChildren();
        if (disc?.guide) {
            const text = doc.createElement('span');
            text.textContent = director.discussion?.guideTask ? 'Preparing this direction…' : (disc.guide.pool.length ? 'Waiting for the next event · applies once' : 'This direction is not ready yet');
            const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.dataset.window = 'cancel-guide'; cancel.textContent = 'Cancel direction'; cancel.disabled = director.busy;
            guideStatus.append(text, cancel);
            const summary = doc.createElement('p'); summary.textContent = disc.guide.summary; guideStatus.append(summary);
            if (!disc.guide.pool.length && !director.discussion?.guideTask) { const retry = doc.createElement('button'); retry.type = 'button'; retry.dataset.window = 'retry-guide'; retry.textContent = 'Prepare again'; guideStatus.append(retry); }
            if (state.pendingEvent?.cycleKey && state.pendingEvent.guideId !== disc.guide.id) { const hint = doc.createElement('small'); hint.textContent = 'The round already prepared keeps its arrangement; this direction is for the next new event.'; guideStatus.append(hint); }
            if (!state.enabled) { const hint = doc.createElement('small'); hint.textContent = 'Turn on Random Event Director for this chat in settings.'; guideStatus.append(hint); }
        } else guideStatus.textContent = disc?.lastUsed ? 'The last direction was used and cleared · new events follow the regular settings' : (disc?.proposal ? 'Summary not applied yet' : 'Free discussion · no pending direction');
        get('proposal').hidden = !disc?.proposal; get('summary').textContent = disc?.proposal?.summary || '';
        button('accept').disabled = director.busy;
        const running = Boolean(director.discussion?.chatTask);
        button('send').disabled = !state || running; button('send').hidden = running; button('stop').hidden = !running;
        button('clear').disabled = !state || running; input.disabled = !state;
        get('notice').textContent = notice || disc?.error || '';
        const pending = state?.pendingEvent?.event;
        if (pendingId !== (pending?.id || null)) { pendingId = pending?.id || null; get('event-reveal').open = false; mini('reveal').open = false; eventNotice = ''; }
        get('enable-events').checked = Boolean(state?.enabled); get('enable-events').disabled = !state;
        mini('enabled').checked = Boolean(state?.enabled); mini('enabled').disabled = !state;
        const diceMode = state?.diceMode || 'pool';
        mini('dice-mode').dataset.mode = diceMode;
        mini('dice-mode').hidden = storyActive;
        mini('dice-mode').setAttribute('aria-label', `Switch roll mode, currently ${diceMode === 'instant' ? 'Instant roll' : 'Regular roll'}`);
        mini('dice-mode').disabled = !state || director.busy || Boolean(director.fill || director.discussion?.guideTask || state.majorEvent || state.progression);
        get('event-count').textContent = state ? `${state.eventPool.length} / ${state.targetCount}` : '—';
        get('event-trigger-label').textContent = state?.diceMode === 'instant' ? 'Instant situation' : state?.progressionMode ? 'Ongoing event' : state?.fixedRoundEnabled ? 'Fixed-round trigger' : 'Trigger probability';
        get('event-probability').textContent = state ? (state.diceMode === 'instant' ? 'Manual · once' : state.progressionMode ? '3 rounds per event' : state.fixedRoundEnabled ? `Every ${state.fixedRoundInterval} rounds` : `${state.triggerProbability}%`) : '—';
        const actionRunning = Boolean(eventTask), rolling = diceAnimating || (eventTask?.owner === currentOwner && eventTask?.action === 'roll');
        const preparing = Boolean(director.fill || director.discussion?.guideTask);
        const failure = state?.refillStopped ? state.generationFailure : null;
        const failed = Boolean(failure && !preparing && !actionRunning);
        const needsConfirmation = Boolean(pending && state.diceMode !== 'instant' && state.progressionMode && !state.pendingEvent.confirmed);
        get('event-label').textContent = pending ? (pending.instant ? 'Instant situation · waiting for this round\'s generation' : needsConfirmation ? 'Drawn · awaiting confirmation' : state.progressionMode ? 'Confirmed · waiting for this round\'s generation' : 'Drawn · waiting for this round\'s generation') : (preparing || actionRunning ? 'Chuyue is preparing an event' : 'The next surprise, not revealed yet');
        get('event-title').textContent = pending?.title || (state ? 'Give the story a few more possibilities' : 'Open a chat first');
        get('event-hint').textContent = pending ? (pending.instant ? 'Instant situation event ready. Used once in the next main chat; the temporary pool was discarded and the regular pool kept.' : state.progressionMode
            ? (needsConfirmation ? 'You can view it, reroll, or confirm and continue. Until confirmed, this event is not used and the event pool\'s direction does not change.'
                : state.progression?.stageIndex > 0 ? 'The follow-up was drawn automatically; just continue the main chat. After the same event unfolds over three successful reply rounds, the next one is drawn automatically.'
                    : 'Continue the main chat; once it takes effect, a related pool is generated and follow-up events begin, each unfolding over three rounds.') : state.majorEvent && pending.id === state.majorEvent.id
            ? `Major event ready; timing starts after the first successful reply and lasts ${state.majorEvent.duration} rounds.`
            : 'Event ready; takes effect in the corresponding normal generation, and this injection ends after a successful reply.') : 'Keep natural random triggers, or roll the die yourself for a small change.';
        get('event-reveal').hidden = !pending; get('event-content').textContent = pending?.content || '';
        for (const confirm of [button('confirm-event'), confirmMini]) {
            confirm.hidden = !needsConfirmation; confirm.disabled = !state?.enabled || director.busy || preparing || actionRunning;
        }
        get('event-recent').textContent = state?.recentEvent?.title || 'None yet';
        window.querySelector('.red-event-footnote').textContent = state?.diceMode === 'instant'
            ? 'Instant situation only generates candidates related to the current activity, draws once at random, then discards the temporary pool. Each roll calls the secondary AI once more; no automatic draws and no continuous progression.' : state?.progressionMode
            ? 'The die opens the side window. After the opening event is confirmed, each follow-up lasts three successful reply rounds, five follow-ups by default; you can pause or end at any time.'
            : 'The die opens the action window; once enabled, click the roll button inside it to draw an event. It takes effect when you continue the main chat and never sends a message by itself.';
        const stoppedNotice = state?.refillStopped && !preparing && !actionRunning ? 'Event generation is paused; use the prepare button or "Retry generation" in the dice window.' : '';
        get('event-notice').textContent = state?.error || eventNotice || stoppedNotice || (!state?.enabled && state ? 'Paused; tick "Turn on random events" in the dice window or above to continue.' : '');
        get('pool-notice').textContent = state?.error || eventNotice || stoppedNotice || '';
        // The die always remains draggable and can reopen the current event, even while a request is busy.
        button('roll').disabled = false; floatingDie.disabled = false;
        button('prepare-pool').disabled = !state?.enabled || director.busy || preparing || actionRunning;
        button('reroll').disabled = !state || director.busy || (preparing && !(state.majorEvent && !state.majorEvent.started && !director.discussion?.guideTask)) || actionRunning;
        button('regenerate-pool').disabled = !state?.enabled || director.busy || preparing || actionRunning;
        get('dice-label').textContent = 'Open dice window';
        button('roll').classList.toggle('red-is-rolling', rolling); floatingDie.classList.toggle('red-is-rolling', rolling);
        floatingDie.classList.toggle('red-die-ready', Boolean(pending));
        const diceTitle = 'Open the dice window to view events or choose a roll; it does not roll automatically';
        floatingDie.title = diceTitle; button('roll').title = diceTitle;
        floatingDie.setAttribute('aria-busy', String(actionRunning || preparing)); button('roll').setAttribute('aria-busy', String(actionRunning || preparing));
        diceDock.hidden = Boolean(director.settingsState()?.hideDice);
        const major = state?.progression || state?.majorEvent;
        diceDock.classList.toggle('red-major-active', Boolean(major || state?.storyEpisode));
        for (const card of [window.querySelector('[data-major-card]'), diceDock.querySelector('[data-major-card]')]) {
            card.hidden = !major;
            card.querySelector('small').textContent = state?.progression ? 'Ongoing event' : 'Major event';
            card.querySelector('[data-major-role="title"]').textContent = state?.progression && state.pendingEvent?.confirmed ? pending?.title : major?.event.title || '';
            card.querySelector('[data-major-role="turns"]').textContent = state?.progression
                ? `${state.enabled ? '' : 'Paused · '}${major.started ? (major.awaitingNext ? `等待准备下个事件 · 已完成 ${major.stageIndex} / ${major.cycles} 个后续`
                    : `第 ${major.stageIndex} / ${major.cycles} 个后续 · 本事件剩余 ${major.stageRemaining} / 3 回合`) : `起始方向待生效 · 之后推进 ${major.cycles} 个后续`}` : major
                ? `${state.enabled ? '' : 'Paused · '}${major.remaining} / ${major.duration} rounds left${major.started ? (major.remaining === 1 ? ' · closing this round' : '') : ' · waiting to take effect'}` : '';
            card.querySelector('button').disabled = !major || director.busy || actionRunning;
            card.querySelector('button').textContent = state?.progression ? 'End ongoing event' : 'End major event';
        }
        diceFeedback.textContent = failed ? 'Generation failed' : (preparing || actionRunning ? 'Preparing…' : (pending ? (needsConfirmation ? 'Awaiting confirmation' : 'Enabled this round') : eventNotice));
        mini('label').textContent = failed ? 'Generation failed · paused' : get('event-label').textContent;
        mini('title').textContent = failed ? 'Event not generated' : (preparing || actionRunning ? 'Preparing event…' : (pending?.title || (state ? 'No event this round' : 'Open a chat first')));
        mini('hint').textContent = !state?.enabled ? 'Paused. Random events continue only after ticking the switch above; the main chat works normally.' : failed ? `Reason: ${failure.message}` : (preparing || actionRunning ? (director.fill?.kind === 'instant' ? 'Reading the current situation, generating temporary candidates and drawing once…' : 'The draw result will show here when ready.') : (pending ? get('event-hint').textContent : (director.busy ? 'The main AI is generating; roll again shortly.' : state?.diceMode === 'instant' ? 'Every roll re-reads the current situation, generates temporarily and draws once. A fight stays on the fight, a date stays on the date; no pool is saved.' : 'Click the button below to draw; it takes effect when you continue the main chat.')));
        mini('reveal').hidden = !pending || failed || preparing || actionRunning; mini('content').textContent = pending?.content || '';
        mini('notice').textContent = failed ? `Automatic retry stopped. ${pending ? 'Events already drawn are kept.' : ''}Normal chat can continue; to generate again, click the button below.` : (preparing || actionRunning ? '' : (state?.error || eventNotice || stoppedNotice));
        mini('failure-actions').hidden = !failure;
        const retry = eventWindow.querySelector('[data-mini-action="retry"]');
        retry.disabled = !state?.enabled || director.busy || preparing || actionRunning;
        const rollMini = eventWindow.querySelector('[data-mini-action="roll"]');
        rollMini.textContent = 'Click to roll';
        rollMini.disabled = !state?.enabled || (pending ? button('reroll').disabled
            : director.busy || preparing || actionRunning || Boolean(failure));
        retry.textContent = preparing || actionRunning ? 'Retrying…' : 'Retry generation';
        if (storyActive) {
            const episode = state?.storyEpisode;
            const title = episode?.event.title || (state?.storyHalted ? 'Plot stopped' : 'Waiting for the next plot segment');
            const hint = episode ? `Based on ${episode.reference || episode.date || state.storyReferenceLabel || state.storyDate || 'current plot'} · unfolded ${episode.turns}  rounds. Continue the main chat; the main AI decides when it is complete. Reroll if you are not happy with it.`
                : state?.storyHalted || state?.storyManual ? 'Roll below to start a new plot segment.' : 'After the first manual World Info read, related material is prepared and a plot is drawn; you still send the main chat yourself.';
            get('event-trigger-label').textContent = 'World Info plot';
            get('event-probability').textContent = state?.storyIndex?.version === 2 ? state.storyDate || state.storyReferenceLabel || 'Uses the prompt when undated' : 'Waiting to read the time index';
            get('event-label').textContent = episode ? 'Dusk plot · in progress' : 'Dusk plot · not started';
            get('event-title').textContent = title; get('event-hint').textContent = hint;
            get('event-reveal').hidden = !episode; get('event-content').textContent = episode?.event.content || '';
            window.querySelector('.red-event-footnote').textContent = 'With a date, nearby plot is read by time; without one, the currently injected plot is used. It moves to the next segment after a full reply clearly marks completion. You can pause, reroll or end at any time.';
            if (!failed && !preparing && !actionRunning) { mini('label').textContent = get('event-label').textContent; mini('title').textContent = title; mini('hint').textContent = hint; }
            if (preparing) mini('hint').textContent = director.fill?.kind === 'story-index' ? 'Reading all entries and labeling plot times…' : 'Reading the date or the plot in the current prompt and preparing outlines…';
            mini('reveal').hidden = !episode; mini('content').textContent = episode?.event.content || '';
            button('reroll').disabled = !state?.enabled || director.busy || preparing || actionRunning;
            rollMini.disabled = !state?.enabled || director.busy || preparing || actionRunning || Boolean(failure);
            for (const card of [window.querySelector('[data-major-card]'), diceDock.querySelector('[data-major-card]')]) {
                card.hidden = !episode; card.querySelector('small').textContent = 'Dusk plot';
                card.querySelector('[data-major-role="title"]').textContent = title;
                card.querySelector('[data-major-role="turns"]').textContent = `${episode?.reference || episode?.date || state?.storyReferenceLabel || state?.storyDate || 'current plot'} · unfolded ${episode?.turns || 0} rounds${state?.enabled ? '' : ' · paused'}`;
                card.querySelector('button').textContent = 'End current plot'; card.querySelector('button').disabled = director.busy || actionRunning;
            }
        }
        if (!failure) shownFailureId = null;
        const showFailure = failed && shownFailureId !== failure.id;
        if (showFailure) { shownFailureId = failure.id; eventWindow.hidden = false; }
        renderPool(state); reflow();
        if (showFailure) positionEvent(true);
        if (page === 'logs') diagnosticsUI.refresh();
    }
    async function eventAction(action) {
        if (action === 'open-dice') { showEvent(); return; }
        if (action === 'roll' || action === 'retry') showEvent();
        const state = director.state(), currentOwner = state?.owner;
        if (action === 'confirm-event') {
            if (director.confirmEvent()) eventNotice = 'Confirmed; continue the main chat. Related follow-ups are prepared once it takes effect.';
            refresh(); return;
        }
        const cancellingMajor = action === 'end-major' || (action === 'reroll' && state?.majorEvent && !state.majorEvent.started);
        if (!state || (!state.enabled && !cancellingMajor) || eventTask || director.busy || (!cancellingMajor && (director.fill || director.discussion?.guideTask)) || (action === 'roll' && (state.pendingEvent || (state.refillStopped && state.generationFailure)))) return;
        const token = { action, owner: currentOwner }; eventTask = token;
        if (action === 'roll' || action === 'reroll') {
            diceAnimating = true; animationUntil = Date.now() + 650;
            if (diceTimer) doc.defaultView.clearTimeout(diceTimer);
            diceTimer = doc.defaultView.setTimeout(() => { diceTimer = null; diceAnimating = false; if (!disposed) refresh(); }, 650);
        }
        try {
            eventNotice = action === 'roll' ? 'Rolling and preparing an event…' : 'Updating event pool…';
            const task = action === 'end-major' ? (state.storyMode ? director.story.end() : state.progression ? director.endProgression() : director.endMajor()) : action === 'retry' ? director.retryGeneration()
                : action === 'reroll' ? director.reroll()
                    : action === 'regenerate-pool' ? director.regeneratePool()
                        : action === 'roll' ? director.rollNow() : director.refill(true); refresh();
            const done = await task;
            if (disposed || director.state()?.owner !== currentOwner) return;
            refresh();
                const current = director.state();
                eventNotice = action === 'end-major' && done ? (current?.storyMode ? 'The current plot has ended; waiting for you to roll again.' : 'The current event line has ended; back to the regular event pool.') : done ? (!['prepare-pool', 'regenerate-pool'].includes(action)
                    ? (current?.progressionMode && !current.pendingEvent?.confirmed ? 'An event was drawn; you can confirm it or reroll.' : 'This round\'s event is enabled; just continue the main chat.') : 'Event pool updated, waiting for the story\'s next scene.')
                    : current?.poolGenerated && !current.eventPool.length && !current.discussion.guide && !current.refillStopped
                        ? 'The event pool is used up; wait for the refresh round, or refresh it by hand.' : 'No new event enabled this time; check the connection or try again later.';
        } catch (e) { if (!disposed && director.state()?.owner === currentOwner) eventNotice = e.message; }
        finally { if (eventTask === token) eventTask = null; if (Date.now() >= animationUntil) diceAnimating = false; if (!disposed) refresh(); }
    }
    async function send(text = input.value) {
        if (!String(text).trim() || director.discussion?.chatTask) return;
        const previous = input.value; notice = ''; input.value = '';
        try { await director.discussion.send(text); } catch (e) { input.value = previous; notice = e.message; }
        refresh();
    }
    function click(event) {
        const target = event.target.closest('button'); if (!target) return;
        if (target.dataset.size) { try { setSize(target.dataset.size, true); } catch (e) { notice = e.message; refresh(); } return; }
        if (target.dataset.view) { view(target.dataset.view); return; }
        if (target.dataset.starter) { void send(target.dataset.starter); return; }
        const action = target.dataset.window; if (!action) return;
        notice = '';
        try {
            const proposal = director.state()?.discussion.proposal;
            if (action === 'close') { window.hidden = true; lastFocus?.focus?.(); }
            else if (action === 'maximize') {
                window.classList.toggle('red-maximized'); const maximized = window.classList.contains('red-maximized');
                for (const property of ['width', 'height']) window.style.removeProperty(property);
                target.setAttribute('aria-label', maximized ? 'Restore window' : 'Maximize window');
                for (const item of window.querySelectorAll('[data-size]')) item.setAttribute('aria-pressed', String(!maximized && item.dataset.size === window.dataset.size));
            }
            else if (action === 'send') { void send(); return; }
            else if (action === 'stop') director.discussion.stop();
            else if (action === 'accept') director.discussion.accept(proposal?.id);
            else if (action === 'reject') director.discussion.reject(proposal?.id);
            else if (action === 'cancel-guide') director.discussion.cancelGuide();
            else if (action === 'retry-guide') void director.discussion.prepareGuide();
            else if (action === 'clear') director.discussion.clearHistory();
            else if (action === 'roll') { showEvent(); return; }
            else if (['reroll', 'prepare-pool', 'regenerate-pool', 'end-major', 'confirm-event'].includes(action)) { void eventAction(action); return; }
        } catch (e) { notice = e.message; }
        refresh();
    }
    const keydown = event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); }
    };
    const launch = event => { const target = event.target.closest('[data-launch]'); if (target) open(target.dataset.launch); };
    const throwDice = () => { if (eventWindow.hidden) showEvent(); else eventWindow.hidden = true; };
    const change = event => {
        try {
            if (event.target === get('enable-events')) director.update({ enabled: event.target.checked });
            else if (event.target === get('persona')) { director.discussion.setPersona(event.target.value); notice = ''; }
            else if (event.target === get('default-persona')) {
                const ctx = context();
                if (ctx.extensionSettings) {
                    ctx.extensionSettings[PERSONA_PREFERENCES_KEY] = { defaultPersona: normalizePersona(event.target.value) };
                    ctx.saveSettingsDebounced?.();
                }
            } else return;
        } catch (e) { notice = e.message; }
        refresh();
    };
    const head = window.querySelector('header');
    const stopMainDrag = makeDraggable(window, head, { canDrag: () => !window.classList.contains('red-maximized') });
    const stopDiceDrag = makeDraggable(diceDock, floatingDie, { ignoreButtons: false });
    const stopEventDrag = makeDraggable(eventWindow, eventWindow.querySelector('header'), { constrain: constrainEventWindow });
    const miniClick = event => {
        const action = event.target.closest('[data-mini-action]')?.dataset.miniAction;
        if (action === 'close') eventWindow.hidden = true;
        else if (action === 'story-mode') toggleStory();
        else if (action === 'switch-mode') {
            try { director.update({ diceMode: director.state()?.diceMode === 'instant' ? 'pool' : 'instant' }); eventNotice = ''; }
            catch (e) { eventNotice = e.message; }
            refresh();
        }
        else if (action === 'roll') void eventAction(director.state()?.pendingEvent || director.state()?.storyEpisode ? 'reroll' : 'roll');
        else if (action === 'retry') void eventAction('retry');
        else if (action === 'confirm-event') void eventAction('confirm-event');
        else if (action === 'logs') { eventWindow.hidden = true; open('logs'); }
        else if (action === 'director') { eventWindow.hidden = true; open('events'); }
    };
    const miniChange = event => {
        if (event.target !== mini('enabled')) return;
        try {
            director.update({ enabled: event.target.checked }); eventNotice = event.target.checked ? '' : 'Random events paused';
        }
        catch (e) { eventNotice = e.message; }
        refresh();
    };
    window.addEventListener('click', click); window.addEventListener('change', change); input.addEventListener('keydown', keydown); entry.addEventListener('click', launch);
    floatingDie.addEventListener('click', throwDice);
    const majorEnd = () => { void eventAction('end-major'); };
    diceDock.querySelector('[data-major-action="end"]').addEventListener('click', majorEnd);
    eventWindow.addEventListener('click', miniClick);
    eventWindow.addEventListener('change', miniChange);
    doc.defaultView.addEventListener('resize', reflow);
    doc.defaultView.visualViewport?.addEventListener('resize', reflow);
    doc.defaultView.visualViewport?.addEventListener('scroll', reflow);
    const menuButton = doc.createElement('button'); menuButton.id = 'red_director_menu'; menuButton.type = 'button'; menuButton.className = 'list-group-item flex-container flexGap5';
    menuButton.innerHTML = '<i class="fa-solid fa-moon extensionsMenuExtensionButton" aria-hidden="true"></i><span>Director System - Chuyue</span>';
    const fromMenu = () => open('chat'); menuButton.addEventListener('click', fromMenu);
    function mountMenu() { const menu = doc.querySelector('#extensionsMenu'); if (menu && !menuButton.isConnected) menu.append(menuButton); }
    mountMenu();
    const Observer = doc.defaultView?.MutationObserver; const observer = Observer ? new Observer(mountMenu) : null;
    observer?.observe(doc.body, { childList: true, subtree: true });
    refresh();
    return { refresh, open, dispose() {
        disposed = true; if (diceTimer) doc.defaultView.clearTimeout(diceTimer);
        stopMainDrag(); stopDiceDrag(); stopEventDrag();
        doc.defaultView.removeEventListener('resize', reflow);
        doc.defaultView.visualViewport?.removeEventListener('resize', reflow);
        doc.defaultView.visualViewport?.removeEventListener('scroll', reflow);
        diceDock.querySelector('[data-major-action="end"]').removeEventListener('click', majorEnd);
        eventWindow.removeEventListener('click', miniClick); eventWindow.remove();
        eventWindow.removeEventListener('change', miniChange);
        floatingDie.removeEventListener('click', throwDice); diceDock.remove();
        if (director.requestStoryReading === showStoryIntro) director.requestStoryReading = null;
        storyIntro.remove();
        diagnosticsUI.dispose();
        updateUI.dispose();
        observer?.disconnect(); menuButton.removeEventListener('click', fromMenu); menuButton.remove(); entry.removeEventListener('click', launch); entry.remove();
        window.removeEventListener('click', click); window.removeEventListener('change', change); input.removeEventListener('keydown', keydown);
        window.remove();
    } };
}
