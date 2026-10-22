// Story calendar values only: UTC is used for arithmetic, never the computer clock.
export function storyTime(value, endOfDay = false) {
    const raw = typeof value === 'number' && Number.isInteger(value) ? String(value) : String(value || '').trim();
    const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    const match = compact || raw.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})日?(?:\s*(?:\([^)]{1,12}\)|（[^）]{1,12}）))?(?:[T\s]+(\d{1,2})[:：时](\d{1,2})分?)?(?::\d{2})?$/);
    if (!match) return null;
    const [, y, m, d, h, minute] = match, year = Number(y), month = Number(m), day = Number(d);
    const hour = h === undefined ? endOfDay ? 23 : 0 : Number(h), min = minute === undefined ? endOfDay ? 59 : 0 : Number(minute);
    if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || min > 59) return null;
    const timestamp = Date.UTC(year, month - 1, day, hour, min, endOfDay && h === undefined ? 59 : 0);
    const check = new Date(timestamp);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    const pad = n => String(n).padStart(2, '0');
    const date = `${year}-${pad(month)}-${pad(day)}`;
    return { timestamp, text: h === undefined ? date : `${date} ${pad(hour)}:${pad(min)}` };
}
export function extractStoryTime(text) {
    const clean = String(text || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\*\*/g, '');
    const date = /^(\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}日?(?:\s*(?:\([^)]{1,12}\)|（[^）]{1,12}）))?(?:[T \t]+\d{1,2}[:：时]\d{1,2}分?)?(?::\d{2})?)/;
    const labels = /(?:当前(?:日期|时间)|故事时间|世界时间|日期时间|日期|时间|datetime|date|time)[\s"'【】\[\]：:=|]*/gi;
    let found = null;
    for (const label of clean.matchAll(labels)) {
        const match = clean.slice(label.index + label[0].length, label.index + label[0].length + 90).match(date);
        if (match) found = storyTime(match[1]) || found;
    }
    if (found) return found;
    // A leading date header is also accepted, but dates buried in prose are not.
    const firstLine = clean.trimStart().split('\n')[0].replace(/^[\s#\[【(（]+/, '');
    const header = firstLine.match(date);
    return header ? storyTime(header[1]) : null;
}
export function currentStoryTime(ctx) {
    for (let i = (ctx.chat?.length || 0) - 1; i >= 0; i--) {
        const message = ctx.chat[i];
        if (message?.is_user || message?.is_system || !String(message?.mes || '').trim()) continue;
        if (!message.gen_finished && i !== 0) continue; // Never use a partially streamed reply.
        return extractStoryTime(message.mes);
    }
    return null;
}
