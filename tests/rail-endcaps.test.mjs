import assert from 'node:assert/strict';
import test from 'node:test';

import { Entity } from 'playcanvas';

import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { solveGutterLayout, solveWallPieceLayout, solveRailEndCaps } from '../src/products/parametric-engine/varenda/varenda-solver.ts';
import { createVarendaView } from '../src/products/varenda/view/varenda-view.ts';

test('rail endcaps align cap holes and screw axes with independently measured rail channels', () => {
    for (const widthMm of [2000, 4000, 8000]) {
        const p = { ...defaultVarendaParams, widthMm };
        const gutter = solveGutterLayout(p);
        const wall = solveWallPieceLayout(p);
        const result = solveRailEndCaps(gutter, wall);
        assert.equal(result.plates.length, 4);
        assert.equal(result.fasteners.length, 14);
        assert.equal(result.connections.length, 14);
        assert.equal(new Set([...result.plates, ...result.fasteners].map(x => x.instanceId)).size, 18);
        for (const plate of result.plates) {
            const rail = plate.railRef.instanceId === 'gutter' ? gutter : wall;
            const channels = plate.railRef.instanceId === 'gutter'
                ? [[-59.9874289166, 8.5], [-59.9874289166, 23.8], [25.0125710834, 23.8], [25.0125710834, 8.5], [61.0125710834, 23.8]]
                : [[5.50171320116, 98], [5.50171320116, 40.6]];
            const sign = plate.mirrorX ? -1 : 1;
            const endX = plate.mirrorX ? widthMm : 0;
            assert.equal(plate.positionMm.x, endX);
            assert.equal(plate.thicknessMm, 2);
            for (let i = 0; i < channels.length; i++) {
                const hole = plate.holes[i];
                assert.equal(hole.diameterMm, 3.6);
                assert.ok(Math.abs(plate.positionMm.y + hole.centerMm.y - rail.positionMm.y - channels[i][0]) < 0.001);
                assert.ok(Math.abs(plate.positionMm.z + hole.centerMm.z - rail.positionMm.z - channels[i][1]) < 0.001);
                const connection = result.connections.find(c => c.endCapHoleRef.partInstanceId === plate.instanceId && c.endCapHoleRef.operationId === hole.operationId);
                assert.ok(connection);
                const screw = result.fasteners.find(f => f.instanceId === connection.fastenerInstanceId);
                assert.deepEqual(screw.axisUnit, { x: sign, y: 0, z: 0 });
                assert.equal(screw.positionMm.x, endX - sign * 2);
                assert.ok(Math.abs(screw.positionMm.y - plate.positionMm.y - hole.centerMm.y) < 1e-9);
                assert.ok(Math.abs(screw.positionMm.z - plate.positionMm.z - hole.centerMm.z) < 1e-9);
            }
        }
    }
});

test('rendered endcaps stay rigid and mirrored at rail ends across width and slope changes', async () => {
    const app = { root: new Entity('scene') };
    const assets = { load: async url => ({ instantiateRenderEntity: () => {
        const e = new Entity('mesh'); e.assetUrl = url; return e;
    } }) };
    const view = await createVarendaView(app, assets);
    try {
        for (const widthMm of [2000, 8000, 4000]) {
            const params = { ...defaultVarendaParams, widthMm };
            const gutter = solveGutterLayout(params), wallPiece = solveWallPieceLayout(params);
            const endCaps = solveRailEndCaps(gutter, wallPiece);
            view.update({ footings: { assemblies: [] }, posts: [], gutter, wallPiece,
                roofSlope: { slopeDegrees: 35 }, endCaps });
            assert.equal(view.root.children[0].children.length, 8 + endCaps.fasteners.length);
            for (const plate of endCaps.plates) {
                const e = view.root.findByName(plate.instanceId);
                assert.equal(e.assetUrl, `/models/varenda/${plate.railRef.instanceId}-endcap.glb`);
                assert.deepEqual(e.getLocalScale().toArray(), [plate.mirrorX ? -1 : 1, 1, 1]);
                assert.deepEqual(e.getLocalEulerAngles().toArray(), [0, 0, 0]);
                const pos = e.getPosition();
                assert.ok(Math.abs(pos.x - plate.positionMm.x) < 0.001);
                assert.ok(Math.abs(pos.y - plate.positionMm.z) < 0.001);
                assert.ok(Math.abs(pos.z + plate.positionMm.y) < 0.001);
            }
        }
    } finally { view.destroy(); app.root.destroy(); }
});
