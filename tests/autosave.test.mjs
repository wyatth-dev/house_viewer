import assert from 'node:assert/strict';
import test from 'node:test';

const { createAutosave } = await import('../src/projects/autosave.ts');
const { ConflictError } = await import('../src/projects/api.ts');

function makeDoc(revision = 0, name = 'A') {
    return {
        schemaVersion: 1, id: 'p-0001', name, revision,
        createdAt: 't0', updatedAt: 't0',
        house: { source: 'preset', typologyId: 'fairy-house' },
        site: { dimensionsMm: { front: 5000, back: 7000, left: 2000, right: 2000 } },
        display: { representation: 'render', trees: true, fence: false, dimensions: true },
        products: [], media: { renders: [], references: [] }
    };
}

function fakeTimers() {
    let now = 0, nextId = 1;
    const pending = new Map();
    const delays = [];
    return {
        delays,
        set(fn, ms) { const id = nextId++; delays.push(ms); pending.set(id, { at: now + ms, fn }); return id; },
        clear(id) { pending.delete(id); },
        async advance(ms) {
            const target = now + ms;
            for (;;) {
                await tick();
                const due = [...pending.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                pending.delete(due[0]);
                now = Math.max(now, due[1].at);
                due[1].fn();
            }
            now = target;
            await tick();
        }
    };
}
const tick = () => new Promise((r) => setImmediate(r));
const rename = (name) => (d) => ({ ...d, name });

test('debounces edits into one save after 800 ms', async () => {
    const t = fakeTimers();
    const calls = [];
    const a = createAutosave(makeDoc(), async (d, k) => { calls.push({ d, k }); return { ...d, revision: d.revision + 1 }; }, t);
    a.update(rename('B'));
    await t.advance(100);
    a.update(rename('C'));
    await t.advance(799); // 799 ms after the last edit
    assert.equal(calls.length, 0);
    await t.advance(1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].d.name, 'C');
    assert.equal(calls[0].k, false);
    assert.equal(a.status, 'saved');
    assert.equal(a.get().revision, 1);
    assert.equal(a.hasPendingChanges(), false);
});

test('an edit during a save is saved after it finishes', async () => {
    const t = fakeTimers();
    const calls = [];
    let release;
    const a = createAutosave(makeDoc(), (d) => {
        calls.push(d);
        return new Promise((res) => { release = () => res({ ...d, revision: d.revision + 1 }); });
    }, t);
    a.update(rename('B'));
    await t.advance(800);
    assert.equal(calls.length, 1);
    assert.equal(a.status, 'saving');
    a.update(rename('C'));
    await t.advance(1000);
    assert.equal(calls.length, 1);
    release();
    await tick();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].name, 'C');
    assert.equal(calls[1].revision, 1);
    release();
    await tick();
    assert.equal(a.status, 'saved');
    assert.equal(a.get().revision, 2);
    assert.equal(a.get().name, 'C');
});

test('failed saves retry at 2, 5 and 15 seconds then every 30', async () => {
    const t = fakeTimers();
    let n = 0;
    const a = createAutosave(makeDoc(), async () => { n++; throw new Error('down'); }, t);
    a.update(rename('B'));
    await t.advance(800);
    assert.equal(n, 1);
    assert.equal(a.status, 'error');
    for (const ms of [2000, 5000, 15000, 30000, 30000]) {
        await t.advance(ms - 1);
        const before = n;
        await t.advance(1);
        assert.equal(n, before + 1, `retry after ${ms}`);
    }
    assert.deepEqual(t.delays.slice(0, 6), [800, 2000, 5000, 15000, 30000, 30000]);
    assert.equal(a.status, 'error');
    assert.equal(a.hasPendingChanges(), true);
});

test('conflict stops autosave until resolved', async () => {
    const t = fakeTimers();
    const server = makeDoc(7, 'Server');
    const calls = [];
    let conflict = true;
    const a = createAutosave(makeDoc(), async (d) => {
        calls.push(d);
        if (conflict) throw new ConflictError(server);
        return { ...d, revision: d.revision + 1 };
    }, t);
    a.update(rename('Mine'));
    await t.advance(800);
    assert.equal(a.status, 'conflict');
    a.update(rename('Mine 2'));
    await t.advance(60000);
    assert.equal(calls.length, 1);
    conflict = false;
    const resolved = await a.resolveConflict('keep');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].revision, 7);
    assert.equal(calls[1].name, 'Mine 2');
    assert.equal(resolved.revision, 8);
    assert.equal(a.status, 'saved');
});

test('reload resolves to the server document', async () => {
    const t = fakeTimers();
    const server = makeDoc(7, 'Server');
    let n = 0;
    const a = createAutosave(makeDoc(), async () => { n++; throw new ConflictError(server); }, t);
    a.update(rename('Mine'));
    await t.advance(800);
    const resolved = await a.resolveConflict('reload');
    assert.deepEqual(resolved, server);
    assert.deepEqual(a.get(), server);
    assert.equal(a.status, 'saved');
    assert.equal(a.hasPendingChanges(), false);
    await t.advance(60000);
    assert.equal(n, 1);
});

test('flush saves immediately with keepalive', async () => {
    const t = fakeTimers();
    const calls = [];
    const a = createAutosave(makeDoc(), async (d, k) => { calls.push(k); return { ...d, revision: 1 }; }, t);
    a.update(rename('B'));
    await a.flush(true);
    assert.deepEqual(calls, [true]);
    assert.equal(a.status, 'saved');
});
