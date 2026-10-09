import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildPhotoMatchInput } from '../src/rendering/photo-landmarks.ts';
import { matchPhotoCamera } from '../src/rendering/photo-match.ts';
const load = (p, m, f) =>
    JSON.parse(readFileSync(new URL(`../data/projects/${p}/typologies/${m}/${f}.json`, import.meta.url)));
const cases = [
    ['p-0002', 'house-002'],
    ['p-0003', 'house-003'],
    ['p-0004', 'house-004'],
    ['p-0006', 'house-007'],
    ['p-0007', 'house-009']
];
for (const [p, m] of cases)
    test(`published measured camera landmarks ${m}`, () => {
        const spec = load(p, m, 'spec'),
            manifest = load(p, m, 'scene');
        const input = buildPhotoMatchInput(spec, manifest, 'photos/p1.jpg', { width: 1200, height: 900 });
        assert.equal(
            input.points.length,
            spec.facade.openings.filter((o) => spec.measurements[o.evidence?.measurement]?.photo === 'p1').length * 4
        );
        const result = matchPhotoCamera(input);
        assert.ok(Number.isFinite(result.errorPx));
        assert.ok(result.errorPx < 20, `residual ${result.errorPx}`);
    });
const spec = {
    facade: {
        side: 'front',
        widthMm: 1000,
        openings: [{ uMm: 500, sillMm: 100, widthMm: 200, heightMm: 300, evidence: { measurement: 'm' } }]
    },
    massing: { depthMm: 600 },
    photos: {
        p: {
            file: 'photos/a.jpg',
            rectification: {
                homography: [
                    [2, 0, 20],
                    [0, 2, 40],
                    [0, 0, 1]
                ]
            }
        }
    },
    measurements: { m: { photo: 'p', kind: 'box', px: [220, 240, 620, 840] } }
};
const manifest = {
    calibration: { sourceFootprint: { minX: -1000, maxX: 0, minZ: -600, maxZ: 0 }, groundY: 10, yawDegrees: 0 },
    units: 'mm',
    axes: { up: '+Y', front: '+Z' }
};
test('inverse rectification and calibrated facade corners for every side', () => {
    for (const [side, right, out, origin] of [
        ['front', { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: -500, y: -10, z: 300 }],
        ['back', { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 500, y: -10, z: -300 }],
        ['left', { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, { x: -100, y: -10, z: -700 }],
        ['right', { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, { x: 500, y: -10, z: 300 }]
    ]) {
        const input = buildPhotoMatchInput({ ...spec, facade: { ...spec.facade, side } }, manifest, 'photos/a.jpg', {
            width: 800,
            height: 600
        });
        assert.deepEqual(input.right, right);
        assert.deepEqual(input.out, out);
        assert.deepEqual(input.origin, origin);
        assert.deepEqual(input.points[0].pixel, [100, 100]);
        assert.equal(input.points[0].world.y, 390);
    }
});
test('refuses unknown photos, missing evidence, singular transforms and degenerate boxes', () => {
    const run = (s) => buildPhotoMatchInput(s, manifest, 'photos/a.jpg', { width: 800, height: 600 });
    assert.throws(
        () => buildPhotoMatchInput(spec, manifest, 'photos/missing.jpg', { width: 800, height: 600 }),
        /photo/i
    );
    assert.throws(() => run({ ...spec, measurements: {} }), /landmark/i);
    assert.throws(
        () =>
            run({
                ...spec,
                photos: {
                    p: {
                        ...spec.photos.p,
                        rectification: {
                            homography: [
                                [0, 0, 0],
                                [0, 0, 0],
                                [0, 0, 0]
                            ]
                        }
                    }
                }
            }),
        /homography/i
    );
    assert.throws(() => run({ ...spec, measurements: { m: { ...spec.measurements.m, px: [1, 1, 1, 4] } } }), /box/i);
});
test('pinhole fit reproduces synthetic photo projections', () => {
    const points = [
        [-400, 100],
        [-200, 400],
        [300, 400],
        [400, 100]
    ].map(([x, y]) => ({ world: { x, y, z: 0 }, pixel: [600 + (900 * x) / 2000, 450 - (900 * (y - 200)) / 2000] }));
    const input = {
        width: 1200,
        height: 900,
        scale: 1000,
        origin: { x: 0, y: 0, z: 0 },
        right: { x: 1, y: 0, z: 0 },
        out: { x: 0, y: 0, z: 1 },
        points
    };
    const { frame, errorPx } = matchPhotoCamera(input);
    assert.ok(errorPx < 0.01);
    for (const { world, pixel } of points) {
        const d = { x: world.x - frame.position.x, y: world.y - frame.position.y, z: world.z - frame.position.z };
        const dot = (v) => d.x * v.x + d.y * v.y + d.z * v.z,
            depth = -dot(frame.out),
            f = 900 / (2 * frame.tanHalfFov);
        assert.ok(
            Math.hypot(600 + (f * dot(frame.right)) / depth - pixel[0], 450 - (f * dot(frame.up)) / depth - pixel[1]) <
                0.01
        );
    }
});
test('solver refuses collinear corresponding landmarks', () => {
    const input = {
        width: 800,
        height: 600,
        scale: 1000,
        origin: { x: 0, y: 0, z: 0 },
        right: { x: 1, y: 0, z: 0 },
        out: { x: 0, y: 0, z: 1 },
        points: [0, 1, 2, 3].map((x) => ({ world: { x, y: 0, z: 0 }, pixel: [x, 1] }))
    };
    assert.throws(() => matchPhotoCamera(input), /degenerate/i);
});
