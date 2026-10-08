import assert from 'node:assert/strict';
import test from 'node:test';

const { createAutosave } = await import('../src/projects/autosave.ts');
const { createEditorState } = await import('../src/projects/editor-state.ts');
const { recordForSwitch, restoreProject } = await import('../src/projects/restore.ts');

const product = {
    instanceId: 'v-1', productType: 'varenda', name: 'Varenda 1',
    attachment: { wallFaceId: 'front', alongWallOffsetMm: 0 },
    params: {}, lockedDimensions: [], lockedParameters: []
};
const savedDoc = () => ({
    schemaVersion: 1, id: 'p-0001', name: 'Project', revision: 3,
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    house: { source: 'photo', typologyId: 'house-001' },
    site: { dimensionsMm: { front: 5000, back: 6000, left: 3000, right: 3000 } },
    display: { representation: 'color-block', trees: false, fence: true, dimensions: false },
    products: [product],
    media: { renders: [], references: [] }
});

/** Manual timers: nothing is saved until the test runs them. */
function fakeTimers() {
    const pending = new Map();
    let next = 1;
    return {
        set(fn) { const handle = next++; pending.set(handle, fn); return handle; },
        clear(handle) { pending.delete(handle); },
        runAll() { for (const [handle, fn] of [...pending]) { pending.delete(handle); fn(); } }
    };
}

function harness(doc) {
    const saves = [];
    const timers = fakeTimers();
    const autosave = createAutosave(doc, async (saved) => {
        saves.push(saved);
        return { ...saved, revision: saved.revision + 1 };
    }, timers);
    const editor = createEditorState(autosave);
    return { saves, timers, autosave, editor };
}

/**
 * Fake scene with the same behaviour as the editor: every applied change fires the
 * change notification an edit would (editor.record), and steps are logged in order.
 */
function fakeScene(editor, { skipped = 0, savesAtStep } = {}) {
    const steps = [];
    let dimensionsMm = { front: 4000, back: 4000, left: 4000, right: 4000 };
    let products = [];
    const notify = (step) => {
        steps.push(step);
        savesAtStep?.(step);
        editor.record(doc => ({ ...doc, name: `${doc.name} (${step})` }));
    };
    return {
        steps,
        setDimensions(value) { dimensionsMm = value; notify('dimensions'); return true; },
        async applyDisplay() { notify('display'); await Promise.resolve(); notify('representation'); },
        async restoreProducts(records) {
            products = records.slice(skipped);
            notify('products');
            return { skipped };
        },
        state: () => ({ dimensionsMm, products }),
        isDisposed: () => false
    };
}

test('opening a project saves nothing during restore and nothing at all when it is unchanged', async () => {
    const doc = savedDoc();
    const { saves, timers, autosave, editor } = harness(doc);
    const scene = fakeScene(editor, { savesAtStep: () => assert.equal(saves.length, 0, 'no save before restore completes') });
    const result = await restoreProject(doc, doc.house, editor, scene);
    timers.runAll();
    await autosave.flush();
    assert.deepEqual(scene.steps, ['dimensions', 'display', 'representation', 'products']);
    assert.equal(result.notice, null);
    assert.equal(saves.length, 0);
    assert.equal(autosave.hasPendingChanges(), false);
    assert.equal(editor.restoring, false);
});

test('a house that no longer exists falls back to Fairy, drops products and saves exactly once', async () => {
    const doc = savedDoc();
    const { saves, timers, autosave, editor } = harness(doc);
    const scene = fakeScene(editor);
    const result = await restoreProject(doc, { source: 'preset', typologyId: 'fairy-house' }, editor, scene);
    timers.runAll();
    await autosave.flush();
    assert.deepEqual(scene.steps, ['dimensions', 'display', 'representation'], 'products are not restored on the fallback house');
    assert.match(result.notice, /no longer exists/);
    assert.equal(saves.length, 1);
    assert.deepEqual(saves[0].house, { source: 'preset', typologyId: 'fairy-house' });
    assert.deepEqual(saves[0].products, []);
    assert.equal(saves[0].name, 'Project', 'restore notifications are not recorded');
    timers.runAll();
    await autosave.flush();
    assert.equal(saves.length, 1);
});

test('skipped products are reported and the corrected state is saved once', async () => {
    const doc = { ...savedDoc(), products: [product, { ...product, instanceId: 'v-2' }] };
    const { saves, timers, autosave, editor } = harness(doc);
    const scene = fakeScene(editor, { skipped: 1 });
    const result = await restoreProject(doc, doc.house, editor, scene);
    timers.runAll();
    await autosave.flush();
    assert.match(result.notice, /1 products could not be restored/);
    assert.equal(saves.length, 1);
    assert.equal(saves[0].products.length, 1);
});

const listed = { id: 'house-002', name: 'B', source: 'photo', projectId: 'p-0001', baseUrl: '/data/projects/p-0001/typologies/house-002/', previewUrl: null };
const preview = { ...listed, id: 'build-7', baseUrl: '/files/projects/p-0001/photo-models/m-1/build-7/' };

test('recordForSwitch ignores a not yet published photo build (temporary preview)', () => {
    assert.equal(recordForSwitch(savedDoc(), preview), null);
});

test('recordForSwitch keeps the products when the house does not change', () => {
    const doc = savedDoc();
    assert.equal(recordForSwitch(doc, { ...listed, id: 'house-001' }), null);
});

test('recordForSwitch stores a new listed house and clears its products', () => {
    const next = recordForSwitch(savedDoc(), listed);
    assert.deepEqual(next.house, { source: 'photo', typologyId: 'house-002' });
    assert.deepEqual(next.products, []);
    const preset = recordForSwitch(savedDoc(), { id: 'fairy-house', name: 'Fairy', source: 'builtin', baseUrl: '/typologies/fairy/', previewUrl: null });
    assert.deepEqual(preset.house, { source: 'preset', typologyId: 'fairy-house' });
});

// Real data: an unpublished build's scene.json id is the photo model id, which is also the id of
// the published typology. The preview differs from the published house only by its /files/ baseUrl.
const published3 = { id: 'house-003', name: 'C', source: 'photo', projectId: 'p-0001', baseUrl: '/data/projects/p-0001/typologies/house-003/', previewUrl: null };
const preview3 = { ...published3, baseUrl: '/files/projects/p-0001/photo-models/house-003/builds/v2/' };
const saved3 = () => ({ ...savedDoc(), house: { source: 'photo', typologyId: 'house-003' } });

test('previewing an unpublished build of the saved house (same id) and returning re-places the saved products', async () => {
    const { planSwitch, previewExit } = await import('../src/projects/restore.ts');
    const doc = saved3();
    // Photo intake shows the unpublished v2 build (supplied typology).
    const toPreview = planSwitch(doc, published3, preview3, true);
    assert.equal(toPreview.skip, false);
    assert.equal(toPreview.previewing, true);
    assert.equal(toPreview.record, null, 'the preview is not saved');
    assert.equal(toPreview.replaceSaved, false);
    // Back to site setup: the saved house is shown again.
    assert.equal(previewExit(doc, true), 'house-003');
    assert.equal(previewExit(doc, false), null, 'nothing to leave when no preview is shown');
    const back = planSwitch(doc, preview3, published3, false);
    assert.equal(back.skip, false, 'same id but a different build: the switch is not a no-op');
    assert.equal(back.previewing, false);
    assert.equal(back.record, null, 'the saved house did not change');
    assert.equal(back.replaceSaved, true, 'its saved products are placed again');
});

test('choosing the house already shown is a no-op; a new listed house is saved without products', async () => {
    const { planSwitch } = await import('../src/projects/restore.ts');
    const doc = saved3();
    assert.equal(planSwitch(doc, published3, published3, false).skip, true);
    const other = planSwitch(doc, published3, listed, false);
    assert.equal(other.skip, false);
    assert.deepEqual(other.record.house, { source: 'photo', typologyId: 'house-002' });
    assert.equal(other.replaceSaved, false);
});
