import assert from 'node:assert/strict';
import test from 'node:test';

const { createEditorState } = await import('../src/projects/editor-state.ts');

function fakeAutosave() {
    let doc = { name: 'A', products: [] };
    const updates = [];
    return {
        updates,
        get: () => doc,
        update(change) { updates.push(change); doc = change(doc); }
    };
}

test('restoring a project does not save until it has been applied', () => {
    const autosave = fakeAutosave();
    const state = createEditorState(autosave);
    state.beginRestore();
    state.record((doc) => ({ ...doc, name: 'B' }));
    state.record((doc) => ({ ...doc, products: [] }));
    state.record((doc) => ({ ...doc, name: 'C' }));
    assert.equal(autosave.updates.length, 0);
    assert.equal(autosave.get().name, 'A');
    state.endRestore();
    state.record((doc) => ({ ...doc, name: 'D' }));
    assert.equal(autosave.updates.length, 1);
    assert.equal(autosave.get().name, 'D');
});

test('records pass straight through when no restore is in progress', () => {
    const autosave = fakeAutosave();
    const state = createEditorState(autosave);
    assert.equal(state.restoring, false);
    state.record((doc) => ({ ...doc, name: 'B' }));
    assert.equal(autosave.updates.length, 1);
    state.beginRestore();
    assert.equal(state.restoring, true);
});
