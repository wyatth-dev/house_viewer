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

test('occupied wall spans split available areas and candidates cannot overlap them', async () => {
    const { solveInstallationAreas, solvePlacementCandidate } = await import('../src/product-placement/geometry.ts');
    const property = { minX: 0, maxX: 8000, minZ: 0, maxZ: 6000 };
    const occupied = [{ ...envelope, widthMm: 2000, attachment: { ...envelope.attachment, alongWallOffsetMm: 2000 } }];
    const areas = solveInstallationAreas([wall], property, occupied);
    assert.equal(areas.length, 2);
    assert.equal(areas[0].corners.wallEnd.x, 3000);
    assert.equal(areas[1].corners.wallStart.x, 5000);
    assert.equal(
        solvePlacementCandidate(
            [wall],
            property,
            { x: 4000, y: 300, z: 2500 },
            { widthMm: 1000, depthMm: 2000 },
            occupied
        ),
        undefined
    );
    const result = solvePlacementCandidate(
        [wall],
        property,
        { x: 6000, y: 300, z: 2500 },
        { widthMm: 4000, depthMm: 2000 },
        occupied
    );
    assert.equal(result.envelope.attachment.alongWallOffsetMm, 4000);
    assert.equal(result.envelope.widthMm, 2000);
    assert.equal(result.wall, wall);
});

test('dimension edits keep width on moves and anchor the left edge on resize', async () => {
    const { editPreviewDimension } = await import('../src/product-placement/geometry.ts');
    const moved = editPreviewDimension(envelope, wall, 2500, 'right', 1000).envelope;
    assert.equal(moved.widthMm, 4000);
    assert.equal(moved.attachment.alongWallOffsetMm, 1000);
    const resized = editPreviewDimension(envelope, wall, 2500, 'width', 3000).envelope;
    assert.equal(resized.attachment.alongWallOffsetMm, 500);
    assert.equal(envelope.widthMm, 4000);
    assert.throws(() => editPreviewDimension(envelope, wall, 2500, 'left', 5000));
});

test('placement framing contains the product and all dimension anchors on every wall direction', async () => {
    const { getPlacementDimensionPoints, getPlacementFocusBounds } =
        await import('../src/product-placement/geometry.ts');
    for (const [alongWallUnit, outwardUnit] of [
        [
            { x: 1, z: 0 },
            { x: 0, z: 1 }
        ],
        [
            { x: 1, z: 0 },
            { x: 0, z: -1 }
        ],
        [
            { x: 0, z: 1 },
            { x: -1, z: 0 }
        ],
        [
            { x: 0, z: -1 },
            { x: 1, z: 0 }
        ]
    ]) {
        const face = { ...wall, alongWallUnit, outwardUnit };
        const corners = Object.values(calculateEnvelopeCorners(envelope, face));
        const productBounds = {
            min: {
                x: Math.min(...corners.map((point) => point.x)),
                y: 300,
                z: Math.min(...corners.map((point) => point.z))
            },
            max: {
                x: Math.max(...corners.map((point) => point.x)),
                y: 2800,
                z: Math.max(...corners.map((point) => point.z))
            }
        };
        const anchors = getPlacementDimensionPoints(envelope, face);
        const bounds = getPlacementFocusBounds(envelope, face, productBounds);
        for (const point of [productBounds.min, productBounds.max, ...Object.values(anchors)]) {
            for (const axis of ['x', 'y', 'z'])
                assert.ok(point[axis] >= bounds.min[axis] && point[axis] <= bounds.max[axis]);
        }
        assert.equal(anchors.productStart.y, 380);
        const start = calculateEnvelopeCorners(envelope, face).wallStart;
        assert.equal(
            (anchors.productStart.x - start.x) * outwardUnit.x + (anchors.productStart.z - start.z) * outwardUnit.z,
            2600
        );
    }
});

 test('dimension edits preserve explicitly locked clearances or width', async () => {
    const { editPreviewDimension, getPreviewDimensions } = await import('../src/product-placement/geometry.ts');
    for (const [previous, field] of [['left', 'right'], ['right', 'left'], ['right', 'width'], ['left', 'width'], ['width', 'left'], ['width', 'right']]) {
        const before = getPreviewDimensions(envelope, wall, 2500);
        const edited = editPreviewDimension(envelope, wall, 2500, field, field === 'width' ? 3000 : 750, new Set([previous]));
        const after = getPreviewDimensions(edited.envelope, wall, 2500);
        assert.equal(after[`${previous}Mm`], before[`${previous}Mm`]);
        assert.equal(after[`${field}Mm`], field === 'width' ? 3000 : 750);
    }
    assert.throws(() => editPreviewDimension(envelope, wall, 2500, 'right', wall.lengthMm, new Set(['left'])));
});

test('locked dimensions cannot change directly or through conflicting edits', async () => {
    const { editPreviewDimension } = await import('../src/product-placement/geometry.ts');
    assert.throws(() => editPreviewDimension(envelope, wall, 2500, 'width', 3000, new Set(['width'])), /locked/i);
    assert.throws(() => editPreviewDimension(envelope, wall, 2500, 'width', 3000, new Set(['left', 'right'])), /locked/i);
    assert.throws(() => editPreviewDimension(envelope, wall, 2500, 'left', 750, new Set(['width', 'right'])), /locked/i);
    const free = editPreviewDimension(envelope, wall, 2500, 'left', 750, new Set()).envelope;
    assert.equal(free.widthMm, envelope.widthMm);
    assert.equal(envelope.attachment.alongWallOffsetMm, 500);
});

test('product editing dimensions follow the product wall basis and match all six parameters', async () => {
    const { getProductParameterDimensions } = await import('../src/product-placement/geometry.ts');
    const { defaultVarendaParams } = await import('../src/products/parametric-engine/varenda/parameters.ts');
    for (const [alongWallUnit, outwardUnit] of [[{ x: 1, z: 0 }, { x: 0, z: 1 }], [{ x: 0, z: -1 }, { x: -1, z: 0 }]]) {
        const params = { ...defaultVarendaParams };
        const dimensions = getProductParameterDimensions(envelope, { ...wall, alongWallUnit, outwardUnit }, params);
        assert.equal(dimensions.length, 6);
        for (const dimension of dimensions) {
            assert.equal(dimension.valueMm, params[dimension.key]);
            const length = Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y, dimension.end.z - dimension.start.z);
            assert.ok(Math.abs(length - dimension.valueMm) < 1e-6);
        }
    }
});
