import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Fairy export retains the double-sided shell without the base slab in millimeters', () => {
    const b = readFileSync(new URL('../public/scenes/typology/fairy-house/model.glb', import.meta.url));
    const gltf = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    assert.equal(gltf.meshes.length, 30);
    assert.ok(gltf.materials.every((m) => m.doubleSided === true));
    const positions = gltf.meshes.flatMap((m) => m.primitives.map((p) => gltf.accessors[p.attributes.POSITION]));
    assert.ok(Math.abs(Math.min(...positions.map((a) => a.min[0])) + 13718.167) < 5);
    assert.ok(Math.max(...positions.map((a) => a.max[1])) > 6900);
    assert.ok(gltf.meshes.every((m) => m.primitives.every((p) => gltf.accessors[p.indices].count >= 3)));
});
