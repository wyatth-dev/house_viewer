import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitPerspective, projectPoint } from '../src/shared/camera/framing.ts';
test('perspective fit contains all scene corners at both angled views and viewport shapes', () => {
    for (const direction of [
        { x: 0.342, y: 0.839, z: 0.94 },
        { x: -0.342, y: 0.839, z: -0.94 }
    ])
        for (const viewport of [
            { width: 980, height: 720 },
            { width: 375, height: 490 }
        ])
            for (const max of [
                { x: 30, y: 19, z: 40 },
                { x: 140, y: 19, z: 10 },
                { x: 10, y: 19, z: 140 }
            ]) {
                const bounds = { min: { x: -23, y: 0, z: -35 }, max };
                const f = fitPerspective(bounds, viewport, direction, 45);
                assert.equal(f.projection, 'perspective');
                for (const x of [bounds.min.x, max.x])
                    for (const y of [0, max.y])
                        for (const z of [bounds.min.z, max.z]) {
                            const p = projectPoint({ x, y, z }, f, viewport);
                            assert.ok(p.visible);
                            assert.ok(p.x >= 0 && p.x <= viewport.width);
                            assert.ok(p.y >= 0 && p.y <= viewport.height);
                        }
            }
});
test('perspective projection makes the same offset larger near the camera', () => {
    const viewport = { width: 800, height: 600 };
    const f = fitPerspective(
        { min: { x: -10, y: 0, z: -10 }, max: { x: 10, y: 10, z: 10 } },
        viewport,
        { x: 0, y: 1, z: 1 },
        45
    );
    const point = (depth) => ({
        x: f.center.x + f.right.x * 2 + f.out.x * depth,
        y: f.center.y + f.right.y * 2 + f.out.y * depth,
        z: f.center.z + f.right.z * 2 + f.out.z * depth
    });
    assert.ok(projectPoint(point(5), f, viewport).x > projectPoint(point(-5), f, viewport).x);
});
