import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { roofJointDatums } from '../src/parametric-engine/varenda/datums.ts';
import { defaultVarendaParams } from '../src/parametric-engine/varenda/parameters.ts';
import { solveGutterLayout, solveRoofSlope, solveWallPieceLayout } from '../src/parametric-engine/varenda/varenda-solver.ts';

test('roof data preserves input dimensions and aligns bearing planes within 0.001 mm', () => {
    for (const widthMm of [2000, 4000, 4398, 8000]) {
        for (const depthMm of [500, 2000, 6000]) {
            for (const wallHeightMm of [1000, 2316, 2500, 3000]) {
                for (const undersideHeightMm of [1000, 1600, 3000]) {
                    const params = Object.freeze({ ...defaultVarendaParams, widthMm, depthMm, wallHeightMm, undersideHeightMm });
                    const wall = solveWallPieceLayout(params);
                    const gutter = solveGutterLayout(params);
                    assert.equal(wall.lengthMm, widthMm);
                    assert.equal(gutter.lengthMm, widthMm);
                    assert.equal(wall.positionMm.z, wallHeightMm);
                    assert.equal(gutter.positionMm.z, undersideHeightMm);
                    assert.equal(wall.positionMm.y - gutter.positionMm.y, depthMm - 75);
                    const { slopeRadians } = solveRoofSlope(params);
                    const w = roofJointDatums.wallPiece;
                    const g = roofJointDatums.gutter;
                    const dy = depthMm - 75 + w.pivotMm.y - g.pivotMm.y;
                    const dz = wallHeightMm + w.pivotMm.z - undersideHeightMm - g.pivotMm.z;
                    // Check the solved plane against both independent support constraints.
                    const residual = -Math.sin(slopeRadians) * dy + Math.cos(slopeRadians) * dz
                        + w.bearingNormalOffsetMm - g.bearingNormalOffsetMm;
                    assert.ok(Math.abs(residual) < 0.001, `Bearing residual ${residual} mm`);
                }
            }
        }
    }
});

test('default roof angle agrees with independently measured CAD datums within 0.001 degree', () => {
    // Slot-side support faces have equal normal offsets to measurement tolerance.
    assert.ok(Math.abs(solveRoofSlope(defaultVarendaParams).slopeDegrees - Math.atan2(867, 2000 - 75 - 35.5125710834) * 180 / Math.PI) < 0.001);
});


test('exported wall profiles preserve exact width and centering at 8000 mm', () => {
    for (const kind of ['fixed', 'moving']) {
        const file = readFileSync(new URL(`../public/models/varenda/wallpiece-${kind}.glb`, import.meta.url));
        const jsonLength = file.readUInt32LE(12);
        const doc = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
        const binOffset = 20 + jsonLength + 8;
        for (const mesh of doc.meshes) {
            const accessor = doc.accessors[mesh.primitives[0].attributes.POSITION];
            const bufferView = doc.bufferViews[accessor.bufferView];
            const offset = binOffset + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
            let min = Infinity;
            let max = -Infinity;
            for (let i = 0; i < accessor.count; i++) {
                const x = file.readFloatLE(offset + i * (bufferView.byteStride ?? 12));
                min = Math.min(min, x);
                max = Math.max(max, x);
            }
            assert.ok(Math.abs((max - min) * 80 - 8000) < 0.001);
            assert.ok(Math.abs((max + min) * 40) < 0.001);
        }
    }
});

// The fixing-plate bolt is centered in the swivel slot. These are the two
// flanking support-face heights read from persisted CAD, not the separate
// Wall Piece shelf at Z=29.2 outside the installed plate footprint.
test('roof slope aligns the actual slot-side fixing-plate support faces', () => {
    for (const depthMm of [500, 2000, 6000]) {
        for (const wallHeightMm of [1000, 2500, 3000]) {
            const params = { ...defaultVarendaParams, depthMm, wallHeightMm };
            const { slopeRadians } = solveRoofSlope(params);
            const c = Math.cos(slopeRadians);
            const s = Math.sin(slopeRadians);
            // Independent CAD points on opposite slot lips, Rhino mm.
            const fixtures = [
                { y: -36.33429032294, z: 28.99622020225, py: -13, pz: 16.5, originY: 0, originZ: wallHeightMm },
                { y: -50.03429032294, z: 28.99622020225, py: -13, pz: 16.5, originY: 0, originZ: wallHeightMm },
                { y: 34.56458730938, z: 61.99622020251, py: 22.5125710834, pz: 49.5, originY: -depthMm + 75, originZ: 1600 },
                { y: 48.56055485754, z: 61.99622020251, py: 22.5125710834, pz: 49.5, originY: -depthMm + 75, originZ: 1600 }
            ];
            const planeOffsets = fixtures.map((p) => {
                const y = p.originY + p.py + c * (p.y - p.py) - s * (p.z - p.pz);
                const z = p.originZ + p.pz + s * (p.y - p.py) + c * (p.z - p.pz);
                return -s * y + c * z;
            });
            assert.ok(Math.max(...planeOffsets) - Math.min(...planeOffsets) < 0.001);
        }
    }
});
