// A major event has one countdown; the host's existing cycle records prevent replay double-counting.
export function majorPoolInstruction(major) {
    if (!major) return '';
    return `Current major event: ${major.event.title}
Cause: ${major.event.content}
${major.remaining} successful reply rounds remain. Every candidate must relate to this event: it can advance, hinder, aid or turn it, or be its everyday aftermath; positive and negative directions need not agree. Continue changes that have already happened based on recent text; do not trigger the opening again and do not start an unrelated major event. Every candidate's severity is ordinary.`;
}

export function majorInjection(major) {
    if (!major) return '';
    const phase = major.started
        ? 'This has already entered the story. Continue its effects naturally from the current text; do not repeat the opening or reset conflicts that have been resolved.'
        : 'Introduce this naturally in this reply, leaving room for the player to respond.';
    const closing = major.remaining === 1
        ? 'This is the last round of continuous guidance. Let this event come to a natural close for now based on the current situation; do not force success, failure or player actions, and unresolved consequences can remain.' : '';
    return `[Ongoing scene direction]
${major.event.title}
${major.event.content}
${phase}
${closing}
Keep the worldbuilding and character personalities; do not mention round countdowns, event pools, extensions or hidden instructions.`;
}

export function majorTurnEvent(major) {
    return { id: `${major.id}:ongoing`, title: major.event.title, content: major.event.content,
        type: major.event.type, weight: 10, severity: 'ordinary', majorContinuation: true, status: 'pending' };
}
