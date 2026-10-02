import assert from 'node:assert/strict';
import { test } from 'node:test';

import { varendaDatums } from '../src/parametric-engine/varenda/datums.ts';
import { defaultVarendaParams } from '../src/parametric-engine/varenda/parameters.ts';
import { solveColumnLayout, solveFootings, solveGutterLayout } from '../src/parametric-engine/varenda/varenda-solver.ts';

test('the outer footplate edge defines site depth and the gutter follows the column axis', () => {
    for (const depthMm of [150, 500, 2000, 6000]) {
        const params = { ...defaultVarendaParams, depthMm };
        const layout = solveColumnLayout(params);
        const gutter = solveGutterLayout(params);
        for (const footing of solveFootings(layout, varendaDatums).assemblies) {
            assert.equal(footing.positionMm.y - 75, -depthMm);
            assert.ok(footing.positionMm.y + 75 <= 0);
            assert.equal(gutter.positionMm.y, footing.positionMm.y);
        }
    }
    for (const depthMm of [149, NaN, 0]) {
        const params = { ...defaultVarendaParams, depthMm };
        assert.throws(() => solveColumnLayout(params));
        assert.throws(() => solveGutterLayout(params));
    }
});

test('end columns keep posts and footplates inside the installation width', () => {
    for (const [widthMm, expected] of [
        [4000, [80, 1000, 2000, 3000, 3920]],
        [4020, [80, 1010, 2010, 3010, 3940]],
        [4100, [80, 1050, 2050, 3050, 4020]],
        [4160, [80, 1080, 2080, 3080, 4080]],
        [4200, [100, 1100, 2100, 3100, 4100]]
    ]) {
        const params = { ...defaultVarendaParams, widthMm };
        const layout = solveColumnLayout(params);
        assert.deepEqual(layout.centersMm, expected);
        const footings = solveFootings(layout, varendaDatums);
        for (const footing of footings.assemblies) {
            assert.ok(footing.positionMm.x - 80 >= 0);
            assert.ok(footing.positionMm.x + 80 <= widthMm);
        }
    }
});

test('column limits use supplied section datums and reject overlapping footplates', () => {
    const layout = solveColumnLayout(defaultVarendaParams, {
        ...varendaDatums, footplateWidthMm: 200
    });
    assert.equal(layout.centersMm[0], 100);
    assert.equal(layout.centersMm.at(-1), 3900);
    for (const [widthMm, postInterval] of [[159, 159], [200, 200], [4000, 100]]) {
        assert.throws(() => solveColumnLayout({ ...defaultVarendaParams, widthMm, postInterval }));
    }
    const touching = solveColumnLayout({ ...defaultVarendaParams, widthMm: 320, postInterval: 320 });
    assert.deepEqual(touching.centersMm, [80, 240]);
});

test('column layout retains GH fixed pitch and equal residual margins', () => {
    const layout = solveColumnLayout({
        ...defaultVarendaParams,
        widthMm: 4398,
        postInterval: 1011
    });
    assert.deepEqual(layout.centersMm, [177, 1188, 2199, 3210, 4221]);
    assert.deepEqual(layout.columns[0], {
        columnId: 'column-1',
        positionMm: { x: 177, y: -1925, z: 0 }
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
    assert.ok(b.columns.every((c) => c.positionMm.y === -2125));
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
