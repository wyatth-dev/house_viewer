import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Entity, Vec3 } from 'playcanvas';

import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { buildProductionList, getInstalledFasteners } from '../src/products/parametric-engine/varenda/production-list.ts';
import { buildInstallationMenus, buildProductionRelations } from '../src/products/parametric-engine/varenda/production-relations.ts';
import { solveVarenda } from '../src/products/parametric-engine/varenda/solution.ts';
import { createVarendaView } from '../src/products/varenda/view/varenda-view.ts';

test('rafter caps use measured screw channels at the front cut, with inherited gable connection explicit', () => {
    for (const depthMm of [500, 2000, 6000]) {
        const solution = solveVarenda({ ...defaultVarendaParams, depthMm });
        assert.equal(solution.rafterEndCaps?.plates.length, solution.rafters.length);
        assert.equal(solution.rafterEndCaps.fasteners.length, solution.rafters.length * 3);
        const installed = getInstalledFasteners(solution);
        const rows = buildProductionList(solution);
        const menus = buildInstallationMenus(solution);
        const graph = buildProductionRelations(solution);
        for (const rafter of solution.rafters) {
            const cap = solution.rafterEndCaps.plates.find(p => p.rafterRef.instanceId === rafter.instanceId);
            assert.ok(cap);
            assert.equal(cap.holes.length, 3);
            assert.ok(rows.some(row => row.instanceIds.includes(cap.instanceId)));
            assert.ok(menus.get(rafter.instanceId).includes(cap.instanceId));
            assert.ok(graph.get(rafter.instanceId).includes(cap.instanceId));
            const c = Math.cos(rafter.slopeRadians), s = Math.sin(rafter.slopeRadians);
            const channelXZ = [[-20.5, 30.2], [20.5, 30.2], [-0.011002, 4.8]];
            for (const [i, [x, z]] of channelXZ.entries()) {
                const mirror = rafter.mirrorX ? -1 : 1;
                const hole = cap.holes[i];
                const actual = {
                    x: cap.positionMm.x + mirror * hole.centerMm.x,
                    y: cap.positionMm.y - hole.centerMm.z * s,
                    z: cap.positionMm.z + hole.centerMm.z * c
                };
                assert.ok(Math.hypot(actual.x - rafter.frontMm.x - mirror * x,
                    actual.y - rafter.frontMm.y + z * s, actual.z - rafter.frontMm.z - z * c) < 0.001);
                const connection = solution.rafterEndCaps.connections.find(k => k.endCapHoleRef.partInstanceId === cap.instanceId && k.endCapHoleRef.operationId === hole.operationId);
                assert.equal(connection.featureStatus, rafter.bodyKind === 'end' && i === 2 ? 'inherited-pending' : 'measured');
                const screw = installed.find(k => k.instanceId === connection.fastenerInstanceId);
                assert.ok(screw);
                assert.ok(Math.hypot(screw.positionMm.x - actual.x, screw.positionMm.y - actual.y + 2 * c, screw.positionMm.z - actual.z + 2 * s) < 0.001);
                assert.ok(Math.hypot(screw.axisUnit.x, screw.axisUnit.y - c, screw.axisUnit.z - s) < 1e-12);
            }
        }
    }
});

test('rendered rafter caps align hole axes while remaining rigid across depth and slope changes', async () => {
    const app = { root: new Entity('scene') };
    const assets = { load: async () => ({ instantiateRenderEntity: () => new Entity('mesh') }) };
    const view = await createVarendaView(app, assets);
    try {
        for (const depthMm of [1000, 6000]) {
            const solution = solveVarenda({ ...defaultVarendaParams, depthMm });
            view.update(solution);
            assert.ok(solution.rafterEndCaps);
            for (const cap of solution.rafterEndCaps.plates) {
                const entity = view.root.findByName(cap.instanceId);
                assert.ok(entity);
                assert.deepEqual(entity.getLocalScale().toArray(), [cap.mirrorX ? -1 : 1, 1, 1]);
                for (const hole of cap.holes) {
                    const p = entity.getWorldTransform().transformPoint(new Vec3(hole.centerMm.x, hole.centerMm.z, 0));
                    const c = Math.cos(cap.slopeRadians), s = Math.sin(cap.slopeRadians);
                    assert.ok(Math.hypot(p.x - cap.positionMm.x - (cap.mirrorX ? -1 : 1) * hole.centerMm.x,
                        p.y - cap.positionMm.z - c * hole.centerMm.z, p.z + cap.positionMm.y - s * hole.centerMm.z) < 0.001);
                }
            }
        }
    } finally { view.destroy(); app.root.destroy(); }
});


test('exported cap holes preserve the independently measured CAD axes within 0.001 mm', () => {
    const b = readFileSync(new URL('../public/models/varenda/rafter-endcap.glb', import.meta.url));
    const n = b.readUInt32LE(12), doc = JSON.parse(b.subarray(20, 20 + n).toString());
    const a = doc.accessors[doc.meshes[0].primitives[0].attributes.POSITION];
    const v = doc.bufferViews[a.bufferView];
    const start = 28 + n + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const points = Array.from({ length: a.count }, (_, i) => [0, 4, 8].map(k => b.readFloatLE(start + i * 12 + k)));
    for (const [x, z] of [[0, 0], [41, 0], [20.488998291600982, -25.4]]) {
        const ring = points.filter(p => Math.abs(p[2]) < 0.001 && Math.abs(Math.hypot(p[0] - x, p[1] - z) - 1.8) < 0.001);
        assert.ok(ring.length > 20);
        for (const p of ring) assert.ok(Math.abs(Math.hypot(p[0] - x, p[1] - z) - 1.8) < 0.001);
        const minX = Math.min(...ring.map(p => p[0])), maxX = Math.max(...ring.map(p => p[0]));
        const minZ = Math.min(...ring.map(p => p[1])), maxZ = Math.max(...ring.map(p => p[1]));
        assert.ok(Math.hypot((minX + maxX) / 2 - x, (minZ + maxZ) / 2 - z) < 0.001);
    }
});
