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
    assert.equal(scene.calibration.actualWidthMm, 43000);
    assert.equal(scene.installationFaces.length, 5);
});

test('typology calibration preserves all existing product installation coordinates', async () => {
    const { defaultTypology } = await import('../src/scenes/typology/index.ts');
    const { houseConfig } = await import('../src/scene/house/house-config.ts');
    assert.equal(houseConfig.url, '/scenes/typology/fairy-house/model.glb');
    assert.equal(defaultTypology.name, 'Fairy house');
    assert.deepEqual(
        defaultTypology.installationFaces.map(({ wallFaceId, originMm, lengthMm }) => [
            wallFaceId,
            originMm.x,
            originMm.y,
            originMm.z,
            lengthMm
        ]),
        [
            ['front-main', -500, 0, 28500, 22000],
            ['back-main', 9500, 0, -28500, 12000],
            ['back-recessed', -21506.79296875, 0, -19500, 12006.75390625],
            ['left-main', -21500, 0, -19500, 31500],
            ['right-main', 21500, 0, -28500, 57000]
        ]
    );
});
