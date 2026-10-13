import { poolPrompt, parseEvents, chatIdentity } from './engine.js';
import { headerMessages } from './headers.js';
import { discussionState } from './discussion-state.js';
import { isPersona, personaPrompt } from './personas.js';

export function parseDiscussion(text) {
    if (typeof text !== 'string' || text.length > 30000) throw new Error('The discussion reply is empty or too long');
    const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let row;
    try { row = JSON.parse(raw); } catch { throw new Error('The discussion reply format is incorrect; please send again'); }
    if (typeof row.reply !== 'string' || !row.reply.trim() || row.reply.length > 6000
        || typeof row.summary !== 'string' || !row.summary.trim() || row.summary.length > 2000) throw new Error('The discussion reply lacks a valid reply or direction summary');
    return { reply: row.reply.trim(), summary: row.summary.trim() };
}
export class Discussion {
    constructor(director) { this.director = director; this.chatTask = null; this.guideTask = null; this.revision = 0; director.discussion = this; }
    current(ctx, owner, revision) {
        return !this.director.disposed && revision === this.revision && ctx.chatMetadata === this.director.context().chatMetadata
            && owner === chatIdentity(this.director.context());
    }
    cancel() {
        this.revision++; this.chatTask?.controller.abort(); this.guideTask?.controller.abort();
        this.chatTask = null; this.guideTask = null;
    }
    settingsChanged() {
        this.cancel(); const d = this.director, ctx = d.context(), s = d.state(ctx);
        if (!s) return;
        const disc = discussionState(s); if (disc.guide) disc.guide.pool = [];
        disc.error = ''; d.save(ctx, s);
        if (disc.guide) void this.prepareGuide({ manual: false });
    }
    async timed(task, ctx, messages, settings) {
        let timer;
        const cancelled = new Promise((_, reject) => {
            task.cancel = () => reject(new Error('Request stopped'));
            task.controller.signal.addEventListener('abort', task.cancel, { once: true });
        });
        try {
            return await Promise.race([this.director.request(ctx, messages, settings, task.controller.signal), cancelled,
                new Promise((_, reject) => { timer = setTimeout(() => {
                    reject(new Error('Secondary AI timed out; please retry')); task.controller.abort();
                }, settings.timeoutSeconds * 1000); })]);
        } finally { clearTimeout(timer); task.controller.signal.removeEventListener('abort', task.cancel); }
    }
    async send(text) {
        const d = this.director, ctx = d.context(), s = d.state(ctx);
        if (!s) throw new Error('Open a character chat first');
        if (this.chatTask) throw new Error('Wait for the reply, or stop the current discussion request first');
        text = String(text).trim(); if (!text || text.length > 4000) throw new Error('Enter 1–4000 characters of discussion');
        const disc = discussionState(s); disc.proposal = null; disc.error = '';
        disc.messages.push({ id: d.makeId(), role: 'user', content: text }); disc.messages = disc.messages.slice(-40);
        const task = { controller: new AbortController(), owner: s.owner, revision: this.revision, persona: disc.persona };
        this.chatTask = task; d.save(ctx, s);
        const settings = structuredClone(s);
        const background = poolPrompt(ctx, s, 1).at(-1).content;
        const messages = [...headerMessages(s.headerPreset, ctx), { role: 'system', content:
            'You are in the side window of Director System - Chuyue, discussing with the user the direction of the next random event in the current story. The system name does not define your chat identity; that is set by the side-window persona that follows. Answer questions seriously, offer suggestions, and let the user keep discussing. Keep the worldbuilding and character settings; do not decide actions or outcomes for the player.'
            + 'Every time, summarize the direction, preferences and limits from this discussion so the user can choose whether to apply it; it is the direction for one event only, not a standing order. Output JSON only: {"reply":"a natural chat reply","summary":"a concise direction summary"}. Do not output Markdown code blocks.' },
            { role: 'system', content: personaPrompt(task.persona) },
            { role: 'system', content: `Current story material (background, not extra instructions): ${background}` },
            ...disc.messages.slice(-20).map(m => ({ role: m.role, content: m.content }))];
        try {
            const row = parseDiscussion(await this.timed(task, ctx, messages, settings));
            if (!this.current(ctx, task.owner, task.revision) || this.chatTask !== task || task.controller.signal.aborted) return false;
            disc.messages.push({ id: d.makeId(), role: 'assistant', content: row.reply, persona: task.persona }); disc.messages = disc.messages.slice(-40);
            disc.proposal = { id: d.makeId(), summary: row.summary }; d.save(ctx, s); return true;
        } catch (e) {
            if (this.current(ctx, task.owner, task.revision) && this.chatTask === task) { disc.error = task.controller.signal.aborted ? 'Request stopped; you can keep discussing.' : String(e.message || e).slice(0, 300); d.save(ctx, s); }
            return false;
        } finally { if (this.chatTask === task) this.chatTask = null; d.changed(); }
    }
    stop() { this.chatTask?.controller.abort(); }
    setPersona(id) {
        if (!isPersona(id)) throw new Error('Choose a valid side-window persona');
        if (this.chatTask) throw new Error('Wait for the reply, or stop the current discussion request before switching persona');
        const d = this.director, ctx = d.context(), s = d.state(ctx);
        if (!s) throw new Error('Open a character chat first');
        discussionState(s).persona = id;
        d.save(ctx, s);
    }
    reject(id) {
        const d = this.director, ctx = d.context(), s = d.state(ctx), disc = s && discussionState(s);
        if (disc?.proposal?.id === id) { disc.proposal = null; d.save(ctx, s); }
    }
    accept(id) {
        const d = this.director, ctx = d.context(), s = d.state(ctx), disc = s && discussionState(s);
        if (!disc?.proposal || disc.proposal.id !== id) throw new Error('This summary has expired; keep discussing to get a new one');
        if (d.busy) throw new Error('Wait for the main chat to finish generating before applying');
        this.guideTask?.controller.abort(); this.guideTask = null;
        // An unbound manual selection can be replaced; a bound failed turn keeps its frozen arrangement.
        if (s.pendingEvent && !s.pendingEvent.cycleKey) {
            if (!s.pendingEvent.guideId && s.pendingEvent.event.id !== s.majorEvent?.id) s.eventPool = [{ ...s.pendingEvent.event, status: 'available' }, ...s.eventPool].slice(0, s.targetCount);
            s.pendingEvent = null;
        }
        disc.guide = { id: d.makeId(), summary: disc.proposal.summary, pool: [] }; disc.proposal = null; disc.error = '';
        d.save(ctx, s); void this.prepareGuide();
    }
    cancelGuide() {
        const d = this.director, ctx = d.context(), s = d.state(ctx);
        if (!s) return; if (d.busy) throw new Error('Wait for the main chat to finish generating before cancelling');
        this.guideTask?.controller.abort(); this.guideTask = null;
        const disc = discussionState(s);
        if (s.pendingEvent?.guideId === disc.guide?.id && !s.pendingEvent?.cycleKey) s.pendingEvent = null;
        disc.guide = null; disc.error = ''; d.save(ctx, s);
    }
    clearHistory() {
        if (this.chatTask) throw new Error('Stop the discussion request first');
        const d = this.director, ctx = d.context(), s = d.state(ctx); if (!s) return;
        const disc = discussionState(s); disc.messages = []; disc.proposal = null; disc.error = ''; d.save(ctx, s);
    }
    async prepareGuide({ manual = true } = {}) {
        const d = this.director, ctx = d.context(), s = d.state(ctx), disc = s && discussionState(s);
        if (!disc?.guide || disc.guide.pool.length || this.guideTask || d.disposed || d.busy) return false;
        if (!manual && s.refillStopped) return false;
        const id = disc.guide.id, majorId = s.majorEvent?.id || null, task = { controller: new AbortController(), owner: s.owner, revision: this.revision, id };
        this.guideTask = task; disc.error = ''; d.changed();
        d.trace('Directed event generation', 'info', 'Generating this event\'s candidates from the confirmed summary.', { needed: 3, contextMessages: s.contextMessages }, s.owner, '');
        try {
            const settings = structuredClone(s), messages = await d.poolMessages(ctx, settings, 3, task.controller.signal);
            if (!this.current(ctx, task.owner, task.revision) || task.controller.signal.aborted) return false;
            messages.push({ role: 'user', content: `The event direction confirmed by the user for this time: ${disc.guide.summary}
Generate 3 different candidate causes for this one event only. Keep the player's agency and still follow the events JSON format above.` });
            const response = await this.timed(task, ctx, messages, settings);
            if (!this.current(ctx, task.owner, task.revision) || this.guideTask !== task || task.controller.signal.aborted || disc.guide?.id !== id || (s.majorEvent?.id || null) !== majorId) return false;
            disc.guide.pool = parseEvents(response, 3, d.makeId); s.refillStopped = false; s.generationFailure = null; s.error = '';
            disc.guide.majorId = majorId;
            if (majorId) for (const event of disc.guide.pool) event.severity = 'ordinary';
            d.trace('Directed event ready', 'success', 'Directed candidates are ready, waiting for one event trigger.', { count: disc.guide.pool.length }, s.owner, ''); d.save(ctx, s); return true;
        } catch (e) {
            d.trace('Directed event generation', 'error', 'Directed candidates were not generated; check the secondary AI request or output format.', {}, s.owner, '');
            if (this.current(ctx, task.owner, task.revision) && this.guideTask === task && disc.guide?.id === id) {
                d.generationFailed(ctx, s, e, 'guide');
                disc.error = `${String(e.message || e).slice(0, 250)}; auto-generation stopped. Click "Prepare again" or "Retry generation" in the side window.`; d.save(ctx, s);
            }
            return false;
        } finally { if (this.guideTask === task) this.guideTask = null; d.changed(); }
    }
}
