import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitOrthographic, fitPerspective, projectPoint } from '../src/camera/framing.ts';
import { landscapeLayout } from '../src/landscape/layout.ts';
import { treeGeometry } from '../src/landscape/tree-geometry.ts';
import { createPbrMaterial } from '../src/materials/material.ts';
import { defaults, calculateLayout, validateDimensions } from '../src/site-definition/layout.ts';

test('a 43m house and default yards are calculated entirely in mm', () => {
    const layout = calculateLayout({ width: 43000, depth: 57000 }, defaults);
    assert.equal(layout.width, 47000);
    assert.equal(layout.depth, 69000);
    assert.equal(layout.property.maxZ, 33500);
    assert.deepEqual(validateDimensions({ front: 50000, back: 0, left: 0, right: 0 }), {});
    assert.ok(validateDimensions({ front: 50001, back: 0, left: 0, right: 0 }).front);
});
test('context road and tree geometry have engineering dimensions', () => {
    const layout = landscapeLayout({ min: { x: -23500, y: 0, z: -35500 }, max: { x: 23500, y: 60, z: 33500 } });
    assert.equal(layout.road.z, 38000);
    assert.equal(layout.road.width, 6000);
    const ys = treeGeometry().bark.positions.filter((_, i) => i % 3 === 1);
    assert.ok(Math.max(...ys) > 8000);
});
test('millimetre detail can be framed without a metre-sized minimum radius', () => {
    const b = { min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 } };
    const viewport = { width: 800, height: 600 };
    for (const fit of [fitOrthographic, fitPerspective]) {
        const f = fit(b, viewport, { x: 1, y: 1, z: 1 });
        for (const x of [-0.5, 0.5])
            for (const y of [0, 0.5])
                for (const z of [-0.5, 0.5]) assert.ok(projectPoint({ x, y, z }, f, viewport).visible);
    }
});
test('a two-metre PBR tile repeats once per 2000 scene units', () => {
    const mat = createPbrMaterial({ label: 'Grass', tileMeters: [2, 2] }, { baseColor: {}, normal: {}, orm: {} });
    try {
        assert.deepEqual([mat.diffuseMapTiling.x, mat.diffuseMapTiling.y], [0.0005, 0.0005]);
    } finally {
        mat.destroy();
    }
});
