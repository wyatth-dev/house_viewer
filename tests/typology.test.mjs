import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('typology catalog packages the default model and its calibration', () => {
    const root = new URL('../public/scenes/typology/', import.meta.url);
    assert.ok(existsSync(new URL('index.json', root)), 'typology index must exist');
    const index = JSON.parse(readFileSync(new URL('index.json', root)));
    assert.equal(index.defaultTypologyId, 'fairy-house');
    const entry = index.typologies.find(({ id }) => id === index.defaultTypologyId);
    const scene = JSON.parse(readFileSync(new URL(entry.manifest, root)));
    assert.equal(scene.schemaVersion, 1);
    assert.equal(scene.id, entry.id);
    assert.equal(scene.units, 'mm');
    assert.ok(existsSync(new URL(scene.model, new URL(entry.manifest, root))));
    assert.equal(scene.calibration.actualWidthMm, 13716);
    assert.equal(scene.installationFaces.length, 5);
});

test('typology calibration uses the corrected millimeter product installation coordinates', async () => {
    const { defaultTypology } = await import('../src/scenes/typology/index.ts');
    const { houseConfig } = await import('../src/scene/house/house-config.ts');
    assert.equal(houseConfig.url, '/scenes/typology/fairy-house/model.glb');
    assert.equal(defaultTypology.name, 'Fairy house');
    const sx = 13716 / 43000;
    const sz = 17576.8 / 57000;
    const expected = [
        ['front-main', -500 * sx, 0, 28500 * sz, 22000 * sx],
        ['back-main', 9500 * sx, 0, -28500 * sz, 12000 * sx],
        ['back-recessed', -21506.79296875 * sx, 0, -19500 * sz, 12006.75390625 * sx],
        ['left-main', -21500 * sx, 0, -19500 * sz, 31500 * sz],
        ['right-main', 21500 * sx, 0, -28500 * sz, 57000 * sz]
    ];
    const actual =         defaultTypology.installationFaces.map(({ wallFaceId, originMm, lengthMm }) => [
            wallFaceId,
            originMm.x,
            originMm.y,
            originMm.z,
            lengthMm
        ]);
    actual.forEach((row, i) => {
        assert.equal(row[0], expected[i][0]);
        row.slice(1).forEach((value, k) => assert.ok(Math.abs(value - expected[i][k + 1]) < 0.001));
    });
});
