import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { houseInstallationFaces } from '../src/scene/house/installation-faces.ts';

test('active house export has one Front and placement uses that same short wall only', () => {
    const bytes = readFileSync(new URL('../public/scenes/typology/fairy-house/model.glb', import.meta.url));
    const model = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const fronts = model.nodes.filter((node) => node.name?.toLowerCase() === 'front');
    assert.equal(fronts.length, 1);
    const position = model.meshes[fronts[0].mesh].primitives[0].attributes.POSITION;
    const bounds = model.accessors[position];
    assert.equal(bounds.max[0] - bounds.min[0], 22000);
    const faces = houseInstallationFaces.filter((face) => face.side === 'front');
    assert.equal(faces.length, 1);
    assert.equal(faces[0].lengthMm, 22000);
    assert.equal(faces[0].wallFaceId, 'front-main');
});
