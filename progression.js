// Runtime direction only: the selected director preset remains unchanged.
export function progressionFocus(state) {
    return state.progression?.started ? `${state.progression.id}:stages:${state.progression.revision}` : '';
}
export function progressionPoolInstruction(direction) {
    return `[Ongoing event mode]\nOpening event: ${direction.root.title}\n${direction.root.content}\nMost recent event in effect: ${direction.event.title}\n${direction.event.content}\nAbout to draw follow-up event ${direction.stageIndex + 1} / ${direction.cycles} ; each follow-up can unfold over three successful reply rounds. Every candidate must relate to this event line and go by what actually happened in the current story, without repeating the opening or resetting resolved conflicts. Candidates can include character reactions, obstacles, opportunities, clues, aftermath or a natural close; the conflict does not need to keep escalating. Keep the selected director preset's style and output format, and do not decide player actions or the ending.${direction.stageIndex + 1 === direction.cycles ? 'This is the last follow-up stage; prefer causes that suit a natural close.' : ''}`;
}
export function progressionInjection(direction) {
    if (!direction) return '';
    return `[Ongoing event direction]\nOpening event: ${direction.root.title}\n${direction.root.content}\nMost recent event in effect: ${direction.event.title}\n${direction.event.content}\n${direction.started ? 'The event is already in the story; carry its effects forward from the current story, without repeating the opening or resetting resolved conflicts.' : 'Introduce the confirmed event naturally this round, without announcing the outcome in advance.'}\n${direction.remaining === 1 ? 'This is the last round of the ongoing event; try to close it naturally or leave reasonable aftermath, without forcing an outcome.' : 'Move along with the actual plot; it can ease off, turn or close, and does not have to keep escalating.'}\nKeep the player's agency, and do not mention the extension, round counts or background instructions.`;
}
export function progressionTurnEvent(direction) {
    return { ...direction.event, id: `${direction.id}:ongoing`, severity: 'ordinary',
        progressionContinuation: true, status: 'pending' };
}
