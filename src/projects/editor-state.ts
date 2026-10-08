import type { Autosave } from './autosave.ts';
import type { ProjectDocument } from './state.ts';

export type EditorState = {
    /** Start applying a saved project to the scene; changes reported meanwhile are not saved. */
    beginRestore(): void;
    endRestore(): void;
    readonly restoring: boolean;
    /** Record an editor change in the project document (ignored while restoring). */
    record(change: (doc: ProjectDocument) => ProjectDocument): void;
};

/**
 * Single write path from the editor into the project document. While a project is being
 * restored, the scene fires the same change notifications as a user edit; recording them would
 * save a half-restored state over the user's data, so they are dropped until endRestore().
 */
export function createEditorState(autosave: Pick<Autosave, 'update'>): EditorState {
    let restoring = false;
    return {
        beginRestore() { restoring = true; },
        endRestore() { restoring = false; },
        get restoring() { return restoring; },
        record(change) {
            if (restoring) return;
            autosave.update(change);
        }
    };
}
