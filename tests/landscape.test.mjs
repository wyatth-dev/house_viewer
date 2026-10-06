import assert from 'node:assert/strict';
import { test } from 'node:test';

import { landscapeLayout } from '../src/scene/landscape/layout.ts';

test('road remains outside zero, maximum and asymmetric properties without tree framing space', () => {
    for (const front of [0, 5000, 50000])
        for (const left of [0, 50000]) {
            const bounds = { min: { x: -21500 - left, y: 0, z: -35500 }, max: { x: 23500, y: 1000, z: 28500 + front } };
            const layout = landscapeLayout(bounds);
            assert.ok(layout.road.z - layout.road.width / 2 - layout.road.shoulder > bounds.max.z);
            assert.equal(layout.road.z, bounds.max.z + 4500);
            assert.equal('trees' in layout, false);
            assert.equal(layout.bounds.min.x, bounds.min.x);
            assert.equal(layout.bounds.min.z, bounds.min.z);
            assert.equal(layout.bounds.max.x, bounds.max.x);
            assert.equal(layout.bounds.max.y, bounds.max.y);
            assert.equal(layout.bounds.max.z, layout.road.z + layout.road.width / 2 + layout.road.shoulder);
        }
});
