import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitOrthographic, projectPoint } from '../src/shared/camera/framing.ts';
test('fixed camera fit includes all corners across wide, deep and portrait views', () => {
    for (const max of [
        { x: 100, y: 19, z: 10 },
        { x: 10, y: 19, z: 100 },
        { x: 7, y: 9, z: 10 }
    ])
        for (const viewport of [
            { width: 1000, height: 600 },
            { width: 320, height: 640 }
        ])
            for (const direction of [
                { x: 0, y: 0.8391, z: 1 },
                { x: 0, y: 0.8391, z: -1 },
                { x: -1, y: 0.8391, z: 0 },
                { x: 1, y: 0.8391, z: 0 }
            ]) {
                const bounds = { min: { x: -6, y: 0, z: -12 }, max };
                const fit = fitOrthographic(bounds, viewport, direction);
                for (const x of [bounds.min.x, max.x])
                    for (const y of [0, max.y])
                        for (const z of [-12, max.z]) {
                            const p = projectPoint({ x, y, z }, fit, viewport);
                            assert.ok(p.visible);
                            assert.ok(p.x >= 0 && p.x <= viewport.width);
                            assert.ok(p.y >= 0 && p.y <= viewport.height);
                        }
            }
});
