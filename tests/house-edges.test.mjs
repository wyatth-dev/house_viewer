import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractCreaseEdges } from '../src/scene/house/crease-edges.ts';

test('white-model edges omit coplanar diagonals even with duplicated seam vertices', () => {
    const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0];
    assert.equal(extractCreaseEdges(positions, [0, 1, 2, 3, 4, 5]).length, 4);
});

test('white-model edges retain a right-angle fold and discard degenerate triangles', () => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
    assert.equal(extractCreaseEdges(positions, [0, 1, 2, 1, 0, 3, 0, 0, 0]).length, 5);
});
