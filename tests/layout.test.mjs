import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateLayout, validateDimensions } from '../src/site-definition/layout.ts';
const house = { width: 8000, depth: 10000 };
const dimensions = { front: 5000, back: 7000, left: 2000, right: 3000 };
test('asymmetric clearances extend each physical side and allocate corners once', () => {
    const l = calculateLayout(house, dimensions);
    assert.equal(l.width, 13000);
    assert.equal(l.depth, 22000);
    assert.deepEqual(l.property, { minX: -6000, maxX: 7000, minZ: -12000, maxZ: 10000 });
    assert.deepEqual(
        Object.values(l.regions).map((r) => (r.maxX - r.minX) * (r.maxZ - r.minZ)),
        [65000000, 91000000, 20000000, 30000000]
    );
});
test('zero and maximum clearances do not overlap or fill the house', () => {
    for (const d of [
        dimensions,
        { front: 0, back: 0, left: 0, right: 0 },
        { front: 50000, back: 50000, left: 50000, right: 50000 }
    ]) {
        const l = calculateLayout(house, d);
        const rs = Object.values(l.regions);
        const area = rs.reduce((a, r) => a + (r.maxX - r.minX) * (r.maxZ - r.minZ), 0);
        assert.equal(area, l.width * l.depth - 80000000);
        for (let i = 0; i < rs.length; i++)
            for (let j = i + 1; j < rs.length; j++) {
                const a = rs[i],
                    b = rs[j];
                assert.ok(
                    Math.min(a.maxX, b.maxX) <= Math.max(a.minX, b.minX) ||
                        Math.min(a.maxZ, b.maxZ) <= Math.max(a.minZ, b.minZ)
                );
            }
    }
});
test('invalid input is rejected while zero and limit are accepted', () => {
    for (const v of [-1, 50001, NaN, Infinity]) assert.ok(validateDimensions({ ...dimensions, front: v }).front);
    for (const v of [0, 100, 50000]) assert.deepEqual(validateDimensions({ ...dimensions, front: v }), {});
});
