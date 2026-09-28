/** Owns startup resources, including ones that resolve after cancellation. */
export function createLifetime() {
    const abort = new AbortController();
    const cleanups: (() => void)[] = [];
    return {
        signal: abort.signal,
        add(cleanup: () => void) {
            if (abort.signal.aborted) cleanup();
            else cleanups.push(cleanup);
        },
        dispose() {
            if (abort.signal.aborted) return;
            abort.abort();
            for (const cleanup of cleanups.reverse()) cleanup();
            cleanups.length = 0;
        }
    };
}
