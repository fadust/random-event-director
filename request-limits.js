// An unlimited wait can still be cancelled by stopping or changing chats.
export function generationLimit(settings, controller, timeoutMessage, cancelMessage = 'Secondary AI request stopped') {
    let timer, onAbort;
    const promise = new Promise((_, reject) => {
        onAbort = () => reject(new Error(cancelMessage));
        controller.signal.addEventListener('abort', onAbort, { once: true });
        if (controller.signal.aborted) { onAbort(); return; }
        if (settings.unlimitedGenerationTime === false) timer = setTimeout(() => {
            reject(new Error(timeoutMessage));
            controller.abort();
        }, settings.timeoutSeconds * 1000);
    });
    return { promise, cleanup() {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', onAbort);
    } };
}
