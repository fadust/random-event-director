# Director System - Chuyue · Random Event Director (English)

> **Unofficial English port.** This is a community translation of
> [random-event-director (随机事件导演)](https://github.com/lucigra-Red/random-event-director) by **lucigra-Red and Random Event Director contributors**. All credit for the extension goes to the original author.
> Only user-facing text (UI, toasts, logs, docs) was translated; behavior is unchanged.
> The original Chinese README is kept as [README.zh-CN.md](README.zh-CN.md).
>
> The original is licensed under the MIT License; its license file is kept unchanged and applies to this port.
>
> **If you are the original author and want this port taken down or changed, open an issue here and it will be removed promptly.**
>
> Report translation problems here. Report bugs in the extension itself upstream.

> **Left as written.** Chuyue's built-in director header (her identity, personality, attitude and greeting) stays in Chinese. You can switch to a SillyTavern preset or no header in *Secondary AI header preset*. The bundled Chinese example `examples/旅馆日常.json` is kept; an English copy is in `examples/inn-daily.json`.

Adds natural chance situations to SillyTavern chats. You can also discuss the plot direction you want with Chuyue; once confirmed, it affects only one random event.

## Install and update

1. In SillyTavern open **Extensions → Install extension** and paste the repository URL:

   ```text
   https://github.com/fadust/random-event-director
   ```

2. Reload the page after installing, then click **Director System - Chuyue** in the **wand menu** next to the input box.
3. Installed users can click **Update** in Chuyue's settings and reload afterwards, or update from SillyTavern's extension manager. Manual installs keep updating the same way, to avoid duplicate installs.

You can also click **Open director system** or **Director settings** in **Extension settings**.

Do not install this alongside the original Chinese version.

## Getting started

1. In Chuyue's window, go to **Settings**. Without a character chat open, you can still configure the API and presets and save them as defaults for new chats.
2. Expand **Secondary AI connection**, enter an OpenAI-compatible API URL, key and model ID, and click **Save secondary AI settings**. You can also choose **Use the current SillyTavern connection**.
3. **Secondary AI header preset** uses Chuyue's header by default; you can switch to a SillyTavern preset or no header. Click **Apply header preset** after changing it.
4. Tick **Turn on Random Event Director for this chat** and wait for it to prepare, or click **Generate / regenerate event pool**.
5. Chat with the character as usual; events appear at the probability you set.

To prepare an event yourself, click the floating die or **Roll now** to open the dice window, tick **Turn on random events**, then click **Click to roll**. Once ready, continue the main chat for it to take effect; rolling itself never sends a main chat reply. The die and event window can be dragged; on desktop the event window can be dragged off the screen edge, and clicking the die brings it back. Settings are grouped by purpose, and longer explanations expand on demand. The top of the window offers large, medium and small sizes; on phones it adapts to the screen.

On the **Random events** page, click **Reroll** under **Prepare / update event pool** to discard the pending event and draw another at random from the remaining candidates. On the **Event pool** page, **Regenerate** discards the regular candidate pool and generates a new one; drawn pending events are kept. When candidates run out, rerolling does not refill the pool early.

Each chat must be turned on separately. The secondary AI connection can be shared; each chat's preset choice, discussion history and pending direction are saved separately.

### Instant roll

The stacked-card button at the top right of the dice window switches between **Regular roll / Instant roll**. A regular roll draws from the prepared event pool; an instant roll reads the current situation each time, generates a temporary pool of related candidates, picks one at random, then discards the pool. A fight stays on the current fight, a date on the current date, with no unrelated side plots.

Instant roll reuses the director preset you chose, and the regular event pool is kept; each roll calls the secondary AI once more. The event is used only for the next main chat reply and never starts an ongoing major event.

### Plot preset

New: **Plot · Turns and progress**. Starting from current goals, relationships, clues and unresolved problems, it adds opportunities, obstacles, discoveries and turns, with fewer unrelated everyday events. Choose and apply it in director preset management, or keep using your own presets.

### Medium preset and major events

In **Director preset management**, choose **Medium · Ups and downs** and apply it: everyday events remain the majority, with more clear good news, bad news and mixed changes, and occasional major opportunities or crises. The default light preset is unchanged.

When a major event is drawn, a related event pool is prepared at once. A small box above the die keeps showing the event name, remaining rounds and an **End major event** button; regular events are still viewed by clicking the die. A major event lasts 5 successful reply rounds by default, adjustable in advanced settings. Failures and regenerations of the same round are not counted twice; the last round tries to close naturally, and afterwards the regular pool returns while story facts that happened are kept.

Rerolling before a major event first takes effect cancels it; after it takes effect, rerolling only swaps the related follow-up. Ending it by hand exits the continuous guidance early. During a major event, manual or scheduled refreshes still produce a related pool; once used up, it does not refill early. Starting and ending a major event each prepare one extra pool of candidates.

## Discussing with Chuyue

On the **Story discussion** page, type your ideas, or click a suggested question to let Chuyue propose directions. The AI replies and gives a direction summary. At the top right you can choose Chuyue, Flan, Konata Izumi or Frieren to change the side-window chat tone.

- **Apply to the next event**: confirm this direction and wait for the next random event.
- **Don't apply**: drop this summary.
- **Just keep typing**: the previous unconfirmed summary is dropped automatically and the discussion continues; no need to click a button first.

A confirmed direction affects only one event. Once the main AI reply for that event succeeds, the direction and temporary candidates clear automatically, and later events follow the regular settings again. If nothing triggers or generation fails, the direction is kept; you can also click **Cancel direction**. A prepared round that failed keeps its original arrangement, and a direction confirmed later is used for the next new event. Regenerating the same reply keeps that reply's original event arrangement.

The discussion is never added to the main chat. After switching character or chat, only that chat's history and direction are shown. **Clear discussion** does not cancel a confirmed direction; use **Cancel direction** for that.

Enter to send, Shift+Enter for a new line; the window can be dragged, maximized and closed.

## Presets

**Secondary AI header preset**: shared by event generation and story discussion, with three choices: Chuyue's header, a SillyTavern preset, or no header. A SillyTavern preset reuses only its enabled prompts, without temperature, sampling or reasoning-effort parameters. Add or edit SillyTavern presets in SillyTavern.

**Director preset management**: choose an event style and click **Apply to this chat**. **Add custom director preset** below creates your own.

- **Secondary AI event generation prompt**: describe the event style you want; keep `{{count}}`.
- **Main AI hidden injection template**: describe how the event joins the story; keep `{{event}}`.
- **Save preset / Save as / Import and export JSON**: save or share your configuration; after importing, choose and apply it.

API keys are not included in director preset exports.

## Common settings

| Setting | How to use it |
|---|---|
| Random event probability | 25% by default; lower for fewer events, higher for more |
| Fixed-round random | When ticked, replaces probability triggering; by default draws once every 5 new rounds, adjustable. Counted after a full reply; regenerations and background requests are not counted twice |
| Major event duration | 5 successful reply rounds by default, settable from 1 to 20; changes affect only major events drawn afterwards |
| Recent messages | Reads the last 16 valid messages by default; a user message and an AI reply count as one each. Lower to 3 or 6 if you like |
| Read hidden messages | When ticked, event generation and side-window discussion also read recent hidden messages |
| Prompt reference | Before preparing the event pool and directed candidates, simulates one empty send to capture the currently assembled World Info, memory and story prompts, stops the main request after capture, then passes them to the secondary AI. No need to send a chat message first, no main AI reply is generated, and unsent drafts are not included. Text only, within the length cap; pauses if reading fails. Supports Chat Completion and Text Completion. Other extensions may also run during the simulation |
| Event injection mode | Three choices: existing, standalone system message, force injection. Force mode adds the pending event to every identifiable generation request, including background and retries |
| Hide floating die | When ticked, hides the floating die on the page; you can still roll from the director window |
| Extra worldbuilding | Add locations, key World Info settings, no-gos and important rules |
| Event pool refresh | Each batch picks a refresh deadline at random between 5 rounds and the limit, at most 10 rounds. If used up before then it is not refilled automatically; refresh by hand. At expiry unused candidates refresh too, and drawn pending events are kept |
| Advanced settings | Event pool size, refresh limit and timeout; keep the defaults if unsure |

Generating events and story discussion both call the secondary AI. The **Event pool** page shows the full candidates and may spoil. New chats default to an event pool target of 10; existing chats keep their own setting.

Candidate events are drawn at random by weight. The **Diagnostic log** records generation notices, actual requests and text completion separately, and queries identifiable Tavern Helper scripts automatically. It gives leads on the source; the enabled list alone cannot prove which extension is at fault. The log never contains chat text or API keys.

## No events or replies?

- Check the secondary AI URL, key and model ID, and confirm the settings are saved.
- Check that the director is on for the current chat and the regular event pool is ready.
- Not every round triggers; click **Roll now**, then send a message to try it.
- If preparing a direction fails, click **Prepare again** on the discussion page; if a discussion request hangs, click **Stop**.
- Event generation pauses on failure and the dice window shows the reason; it only requests again after you click **Retry generation**.
- If the API rejects sampling parameters, tick **Exclude temperature and sampling parameters (compatibility mode)** in **Secondary AI connection**.
- The main chat still needs your usual AI connection. Chuyue's separate secondary AI setup supports OpenAI-compatible APIs; reusing the SillyTavern connection supports Chat Completion and Text Completion.
