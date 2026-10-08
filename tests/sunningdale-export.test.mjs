import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../public/scenes/typology/sunningdale-house/', import.meta.url);
const read = (path) => {
    const b = readFileSync(new URL(path, root));
    return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
};

test('Sunningdale states share the calibrated millimeter envelope and are registered', async () => {
    const scene = JSON.parse(readFileSync(new URL('scene.json', root)));
    assert.equal(scene.calibration.actualWidthMm, 11300);
    for (const [state, count] of [
        ['model.glb', 2],
        ['color-block/model.glb', 6],
        ['render/model.glb', 9]
    ]) {
        const gltf = read(state);
        assert.equal(gltf.materials.length, count);
        assert.ok(gltf.materials.every((m) => m.doubleSided === true));
        const walls = gltf.nodes.filter((n) => ['Front', 'Back', 'Left', 'right'].includes(n.name));
        assert.equal(walls.length, 4);
        const accessors = walls.flatMap((n) =>
            gltf.meshes[n.mesh].primitives.map((p) => gltf.accessors[p.attributes.POSITION])
        );
        assert.ok(Math.abs(Math.min(...accessors.map((a) => a.min[0])) + 11300) < 0.01);
        assert.ok(Math.abs(Math.min(...accessors.map((a) => a.min[2])) + 10400) < 0.01);
        assert.ok(gltf.meshes.every((m) => m.primitives.every((p) => gltf.accessors[p.indices].count >= 3)));
    }
    const { typologies, defaultTypology } = await import('../src/scenes/typology/index.ts');
    assert.equal(defaultTypology.id, 'fairy-house');
    const sunningdale = typologies.find(({ id }) => id === 'sunningdale-house');
    assert.equal(sunningdale.modelUrl, '/scenes/typology/sunningdale-house/model.glb');
    assert.equal(sunningdale.installationFaces.length, 5);
});
