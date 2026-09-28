import assert from 'node:assert/strict';
import { test } from 'node:test';

import { landscapeLayout } from '../src/landscape/layout.ts';
import { treeGeometry } from '../src/landscape/tree-geometry.ts';

test('the parallel road and complete tree crowns remain outside zero, maximum and asymmetric properties', () => {
    for (const front of [0, 5, 50])
        for (const left of [0, 50]) {
            const bounds = { min: { x: -21.5 - left, y: 0, z: -35.5 }, max: { x: 23.5, y: 1, z: 28.5 + front } };
            const layout = landscapeLayout(bounds);
            assert.ok(layout.road.z - layout.road.width / 2 - layout.road.shoulder > bounds.max.z);
            assert.equal(layout.road.z, bounds.max.z + 4.5);
            for (const tree of layout.trees) {
                const radius = 4.2 * tree.scale;
                assert.ok(
                    tree.x + radius < bounds.min.x ||
                        tree.x - radius > bounds.max.x ||
                        tree.z + radius < bounds.min.z ||
                        tree.z - radius > bounds.max.z
                );
            }
        }
});
test('tree geometry is deterministic, finite and stays within the lightweight triangle budget', () => {
    const tree = treeGeometry();
    assert.deepEqual(tree, treeGeometry());
    let triangles = 0;
    for (const geometry of Object.values(tree)) {
        assert.ok(geometry.positions.every(Number.isFinite));
        assert.equal(geometry.normals.length, geometry.positions.length);
        assert.equal(geometry.colors.length, (geometry.positions.length / 3) * 4);
        assert.ok(geometry.indices.every((index) => index >= 0 && index < geometry.positions.length / 3));
        triangles += geometry.indices.length / 3;
    }
    assert.ok(triangles < 6000);
});
