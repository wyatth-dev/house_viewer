import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateEnvelopeCorners } from '../src/product-placement/geometry.ts';

const wall = {
    wallFaceId: 'front-1',
    structureId: 'house-1',
    side: 'front',
    originMm: { x: 1000, y: 300, z: 2000 },
    alongWallUnit: { x: 1, z: 0 },
    outwardUnit: { x: 0, z: 1 },
    lengthMm: 6000
};

const envelope = {
    instanceId: 'envelope-1',
    productType: 'varenda',
    attachment: {
        kind: 'wall',
        structureId: 'house-1',
        wallFaceId: 'front-1',
        alongWallOffsetMm: 500
    },
    widthMm: 4000,
    depthMm: 2000
};

test('corners include wall origin, offset and elevation', () => {
    assert.deepEqual(calculateEnvelopeCorners(envelope, wall), {
        wallStart: { x: 1500, y: 300, z: 2000 },
        wallEnd: { x: 5500, y: 300, z: 2000 },
        outerEnd: { x: 5500, y: 300, z: 4000 },
        outerStart: { x: 1500, y: 300, z: 4000 }
    });
});

test('placement follows wall directions rather than side label', () => {
    const rotatedWall = {
        ...wall,
        side: 'right',
        alongWallUnit: { x: 0, z: -1 },
        outwardUnit: { x: 1, z: 0 }
    };

    assert.deepEqual(calculateEnvelopeCorners(envelope, rotatedWall), {
        wallStart: { x: 1000, y: 300, z: 1500 },
        wallEnd: { x: 1000, y: 300, z: -2500 },
        outerEnd: { x: 3000, y: 300, z: -2500 },
        outerStart: { x: 3000, y: 300, z: 1500 }
    });
});

test('wall endpoint is allowed but exceeding it is rejected', () => {
    assert.doesNotThrow(() => calculateEnvelopeCorners({ ...envelope, widthMm: 5500 }, wall));

    assert.throws(() => calculateEnvelopeCorners({ ...envelope, widthMm: 5501 }, wall), /wall range/);
});

test('invalid dimensions, references and directions are rejected', () => {
    assert.throws(() => calculateEnvelopeCorners({ ...envelope, depthMm: -1 }, wall));

    assert.throws(() => calculateEnvelopeCorners({ ...envelope, widthMm: NaN }, wall));

    assert.throws(() => calculateEnvelopeCorners(envelope, { ...wall, wallFaceId: 'other' }));

    assert.throws(() =>
        calculateEnvelopeCorners(envelope, {
            ...wall,
            outwardUnit: { x: 1, z: 0 }
        })
    );
});
test('cursor candidate follows the wall and clamps its width at both ends', async () => {
    const { solvePlacementCandidate } = await import('../src/product-placement/geometry.ts');
    const property = { minX: 0, maxX: 8000, minZ: 0, maxZ: 6000 };
    const defaults = { widthMm: 4000, depthMm: 2000 };
    const left = solvePlacementCandidate([wall], property, { x: 1100, y: 300, z: 2500 }, defaults);
    const right = solvePlacementCandidate([wall], property, { x: 6900, y: 300, z: 2500 }, defaults);
    assert.equal(left.envelope.attachment.alongWallOffsetMm, 0);
    assert.equal(right.envelope.attachment.alongWallOffsetMm, 2000);
    assert.equal(right.wall.wallFaceId, wall.wallFaceId);
    assert.equal(solvePlacementCandidate([wall], property, { x: 2000, y: 300, z: 1900 }, defaults), undefined);
});

test('preview dimensions adapt to available depth and separate recessed walls', async () => {
    const { solvePlacementCandidate } = await import('../src/product-placement/geometry.ts');
    const property = { minX: 0, maxX: 8000, minZ: 0, maxZ: 3000 };
    const defaults = { widthMm: 4000, depthMm: 2000 };
    const small = { ...wall, wallFaceId: 'small-wall', lengthMm: 3000 };
    const candidate = solvePlacementCandidate([small], property, { x: 2000, y: 300, z: 2500 }, defaults);
    assert.equal(candidate.envelope.widthMm, 3000);
    assert.equal(candidate.envelope.depthMm, 1000);
    const recessed = { ...wall, wallFaceId: 'recessed', originMm: { x: 1000, y: 300, z: 500 }, lengthMm: 3000 };
    const match = solvePlacementCandidate([wall, recessed], property, { x: 2000, y: 300, z: 1000 }, defaults);
    assert.equal(match.wall.wallFaceId, 'recessed');
    assert.equal(solvePlacementCandidate([wall], property, { x: NaN, y: 300, z: 2500 }, defaults), undefined);
});
