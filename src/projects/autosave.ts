import { ConflictError } from './api.ts';
import type { ProjectDocument } from './state.ts';

export type AutosaveStatus = 'saved' | 'saving' | 'error' | 'conflict';

export type Autosave = {
    get(): ProjectDocument;
    update(change: (doc: ProjectDocument) => ProjectDocument): void;
    onStatus(listener: (status: AutosaveStatus) => void): () => void;
    readonly status: AutosaveStatus;
    retry(): void;
    flush(keepalive?: boolean): Promise<void>;
    resolveConflict(choice: 'reload' | 'keep'): Promise<ProjectDocument>;
    hasPendingChanges(): boolean;
    destroy(): void;
};

type Timers = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };

const DEBOUNCE_MS = 800;
const RETRY_MS = [2000, 5000, 15000];
const RETRY_REPEAT_MS = 30000;

const realTimers: Timers = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export function createAutosave(
    initial: ProjectDocument,
    save: (doc: ProjectDocument, keepalive: boolean) => Promise<ProjectDocument>,
    timers: Timers = realTimers
): Autosave {
    let doc = initial;
    let status: AutosaveStatus = 'saved';
    let dirty = false;
    let inflight: Promise<void> | null = null;
    let timer: unknown = null;
    let failures = 0;
    let conflict: ProjectDocument | null = null;
    let destroyed = false;
    const listeners = new Set<(s: AutosaveStatus) => void>();

    function setStatus(next: AutosaveStatus): void {
        if (status === next) return;
        status = next;
        for (const listener of [...listeners]) listener(next);
    }

    function clearTimer(): void {
        if (timer !== null) timers.clear(timer);
        timer = null;
    }

    function schedule(ms: number): void {
        clearTimer();
        if (destroyed) return;
        timer = timers.set(() => { timer = null; void run(false); }, ms);
    }

    function run(keepalive: boolean): Promise<void> {
        if (destroyed || conflict) return Promise.resolve();
        if (inflight) return inflight;
        if (!dirty) return Promise.resolve();
        clearTimer();
        const snapshot = doc;
        dirty = false;
        setStatus('saving');
        inflight = (async () => {
            try {
                const saved = await save(snapshot, keepalive);
                failures = 0;
                // Keep edits made while saving; adopt only the server-assigned fields.
                doc = { ...doc, revision: saved.revision, updatedAt: saved.updatedAt };
            } catch (error) {
                dirty = true;
                if (error instanceof ConflictError) {
                    conflict = error.current;
                    setStatus('conflict');
                } else {
                    const delay = failures < RETRY_MS.length ? RETRY_MS[failures] : RETRY_REPEAT_MS;
                    failures++;
                    setStatus('error');
                    schedule(delay);
                }
                return;
            } finally {
                inflight = null;
            }
            if (dirty && !destroyed) {
                await run(false);
            } else {
                setStatus('saved');
            }
        })();
        return inflight;
    }

    return {
        get: () => doc,
        update(change) {
            doc = change(doc);
            dirty = true;
            if (conflict || destroyed) return;
            // While failing, the backoff timer owns the next attempt; mid-save, finishing picks it up.
            if (status === 'error' || inflight) return;
            schedule(DEBOUNCE_MS);
        },
        onStatus(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        get status() { return status; },
        retry() {
            if (conflict) return;
            clearTimer();
            void run(false);
        },
        async flush(keepalive = false) {
            if (conflict || destroyed) return;
            clearTimer();
            if (inflight) await inflight;
            await run(keepalive);
        },
        async resolveConflict(choice) {
            const current = conflict;
            if (!current) return doc;
            conflict = null;
            failures = 0;
            if (choice === 'reload') {
                doc = current;
                dirty = false;
                clearTimer();
                setStatus('saved');
                return doc;
            }
            doc = { ...doc, revision: current.revision };
            dirty = true;
            await run(false);
            return doc;
        },
        hasPendingChanges: () => dirty || inflight !== null,
        destroy() {
            destroyed = true;
            clearTimer();
            listeners.clear();
        }
    };
}
