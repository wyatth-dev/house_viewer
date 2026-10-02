import assert from 'node:assert/strict';
import { test } from 'node:test';

import { varendaDatums } from '../src/parametric-engine/varenda/datums.ts';
import { defaultVarendaParams } from '../src/parametric-engine/varenda/parameters.ts';
import { solveColumnLayout, solveFootings } from '../src/parametric-engine/varenda/varenda-solver.ts';

test('column layout retains GH fixed pitch and equal residual margins', () => {
    const layout = solveColumnLayout({
        ...defaultVarendaParams,
        widthMm: 4398,
        postInterval: 1011
    });
    assert.deepEqual(layout.centersMm, [177, 1188, 2199, 3210, 4221]);
    assert.deepEqual(layout.columns[0], {
        columnId: 'column-1',
        positionMm: { x: 177, y: -2000, z: 0 }
    });
    assert.equal(layout.columns.length, 5);
});
test('footings consume shared column identities and do not mutate the layout', () => {
    const layout = solveColumnLayout(defaultVarendaParams);
    const snapshot = structuredClone(layout);
    const result = solveFootings(layout, varendaDatums);
    assert.deepEqual(
        result.assemblies.map((a) => a.columnId),
        layout.columns.map((c) => c.columnId)
    );
    assert.deepEqual(
        result.assemblies.map((a) => a.positionMm),
        layout.columns.map((c) => c.positionMm)
    );
    assert.equal(result.assemblies[0].instanceId, 'footing-column-1');
    assert.equal(result.assemblies[0].catalogProductId, 'varenda-footplate');
    assert.deepEqual(layout, snapshot);
    assert.notEqual(result.assemblies[0].positionMm, layout.columns[0].positionMm);
});
test('depth changes only outward coordinates, not column count or pitch', () => {
    const a = solveColumnLayout(defaultVarendaParams);
    const b = solveColumnLayout({ ...defaultVarendaParams, depthMm: 2200 });
    assert.deepEqual(b.centersMm, a.centersMm);
    assert.deepEqual(
        b.columns.map((c) => c.columnId),
        a.columns.map((c) => c.columnId)
    );
    assert.ok(b.columns.every((c) => c.positionMm.y === -2200));
});
test('invalid input rejects before producing a layout', () => {
    for (const change of [{ depthMm: NaN }, { depthMm: 0 }, { widthMm: 500 }, { postInterval: 0 }]) {
        assert.throws(() => solveColumnLayout({ ...defaultVarendaParams, ...change }));
    }
});

test('posts and footings share identities and the post top reaches the underside height', async () => {
    const { solvePosts } = await import('../src/parametric-engine/varenda/varenda-solver.ts');
    const layout = solveColumnLayout(defaultVarendaParams);
    const footings = solveFootings(layout, varendaDatums);
    const posts = solvePosts(layout, defaultVarendaParams, varendaDatums);
    assert.deepEqual(
        posts.map((p) => p.columnId),
        footings.assemblies.map((f) => f.columnId)
    );
    for (const post of posts) {
        assert.equal(post.positionMm.z, 5);
        assert.equal(post.lengthMm, 1595);
        assert.equal(post.positionMm.z + post.lengthMm, 1600);
    }
    const taller = solvePosts(layout, { ...defaultVarendaParams, undersideHeightMm: 2000 }, varendaDatums);
    assert.deepEqual(
        taller.map((p) => p.positionMm),
        posts.map((p) => p.positionMm)
    );
    assert.ok(taller.every((p) => p.lengthMm === 1995));
    assert.throws(() => solvePosts(layout, { ...defaultVarendaParams, undersideHeightMm: 5 }, varendaDatums));
});
