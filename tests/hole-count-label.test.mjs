import assert from 'node:assert/strict';
import test from 'node:test';

import { specificationLabel } from '../src/product-placement/production-list.ts';

test('hole and channel quantities have no millimeter unit', () => {
    const label = specificationLabel({ specification: { lengthMm: 100, holeCount: 10, channelCount: 2, pendingHoleDepthCount: 3 } });
    assert.equal(label, 'L 100 mm · Holes 10 · Channels 2 · Depth pending 3');
});
