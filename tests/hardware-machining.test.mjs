import assert from 'node:assert/strict';
import test from 'node:test';

import { Entity, Vec3 } from 'playcanvas';

import { validateMachiningReferences } from '../src/products/parametric-engine/varenda/machining.ts';
import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { buildProductionList, getInstalledFasteners } from '../src/products/parametric-engine/varenda/production-list.ts';
import { solveVarenda } from '../src/products/parametric-engine/varenda/solution.ts';
import { createVarendaView } from '../src/products/varenda/view/varenda-view.ts';

test('part-owned holes and channels resolve every installed fastener without duplicate physical holes', () => {
    const s = solveVarenda(defaultVarendaParams);
    assert.ok(s.machining);
    const features = s.machining.parts.flatMap(p => p.features.map(f => `${p.partInstanceId}/${f.operationId}`));
    assert.equal(new Set(features).size, features.length);
    const hardware = getInstalledFasteners(s);
    const referenced = new Set();
    for (const c of s.machining.connections) {
        for (const ref of c.featureRefs) assert.ok(features.includes(`${ref.partInstanceId}/${ref.operationId}`));
        for (const id of c.fastenerInstanceIds) { assert.ok(hardware.some(h => h.instanceId === id)); referenced.add(id); }
    }
    assert.equal(referenced.size, hardware.length);
    for (const p of s.posts) assert.equal(s.machining.parts.find(x => x.partInstanceId === p.instanceId).features.filter(f => f.kind === 'hole').length, 10);
    for (const r of s.rafters) {
        for (const stand of [r.stands.front, r.stands.rear]) {
            const part = s.machining.parts.find(x => x.partInstanceId === stand.instanceId);
            assert.equal(part.features.length, 1);
            assert.equal(part.features[0].diameterMm, 8);
            assert.deepEqual(part.features[0].extent, { kind: 'through', depthMm: 3 });
            const c = s.machining.connections.find(c => c.featureRefs.some(ref => ref.partInstanceId === stand.instanceId));
            assert.equal(c.fastenerInstanceIds.length, 2);
        }
    }
    const rows = buildProductionList(s);
    assert.ok(rows.filter(r => r.catalogProductId === 'varenda-post-profile').every(r => r.specification.holeCount === 10));
});

test('every hardware instance renders an unscaled engineer mesh at its measured installation reference', async () => {
    const app = { root: new Entity('scene') };
    const assets = { load: async url => ({ instantiateRenderEntity: () => { const e = new Entity('mesh'); e.assetUrl = url; return e; } }) };
    const view = await createVarendaView(app, assets);
    try {
        for (const depthMm of [1000, 6000]) {
            const solution = solveVarenda({ ...defaultVarendaParams, depthMm });
            view.update(solution);
            for (const h of getInstalledFasteners(solution)) {
                const entity = view.root.findByName(h.instanceId);
                assert.ok(entity, h.instanceId);
                assert.deepEqual(entity.getLocalScale().toArray(), [1, 1, 1]);
                const offset = h.modelOffsetMm ?? 0;
                const p = entity.getPosition();
                assert.ok(Math.hypot(p.x - h.positionMm.x - offset * h.axisUnit.x,
                    p.y - h.positionMm.z - offset * h.axisUnit.z, p.z + h.positionMm.y + offset * h.axisUnit.y) < 0.001);
                const axis = entity.getWorldTransform().transformVector(new Vec3(0, 0, -1));
                assert.ok(Math.hypot(axis.x - h.axisUnit.x, axis.y - h.axisUnit.z, axis.z + h.axisUnit.y) < 0.001);
            }
        }
    } finally { view.destroy(); app.root.destroy(); }
});


test('machining validation rejects unresolved references and duplicate operations', () => {
    const s = solveVarenda(defaultVarendaParams);
    const bad = { ...s.machining, parts: s.machining.parts.map((p, i) => i === 0 ? { ...p, features: [] } : p) };
    assert.throws(() => validateMachiningReferences(bad), /Unresolved/);
    const p = s.machining.parts.find(p => p.features.length);
    assert.throws(() => validateMachiningReferences({ ...s.machining,
        parts: s.machining.parts.map(part => part === p ? { ...part, features: [...part.features, part.features[0]] } : part) }), /Duplicate/);
});


test('machining connection validation rejects missing fasteners and unconnected hardware', () => {
    const s = solveVarenda(defaultVarendaParams);
    const ids = getInstalledFasteners(s).map(h => h.instanceId);
    assert.throws(() => validateMachiningReferences(s.machining, ids.slice(1)), /Unresolved fastener/);
    assert.throws(() => validateMachiningReferences(s.machining, [...ids, 'extra-screw']), /Unconnected/);
});

test('installed axial depth preserves engineer seating while leaving theoretical holes unchanged', () => {
    const s = solveVarenda(defaultVarendaParams);
    const hardware = getInstalledFasteners(s);
    const cap = hardware.find(h => h.instanceId.includes('endcap-front-screw'));
    assert.deepEqual(cap.axialExtentMm, [0, 16]);
    const bolt = hardware.find(h => h.catalogProductId === 'varenda-rafter-stand-bolt');
    const nut = hardware.find(h => h.catalogProductId === 'varenda-rafter-stand-nut');
    assert.deepEqual(bolt.axialExtentMm, [-11.5, 8.5]);
    assert.deepEqual(nut.axialExtentMm, [0, 6.6666667]);
    const top = hardware.find(h => h.instanceId.includes('-gutter-screw-'));
    assert.ok(Math.abs(top.axialExtentMm[1] - (16 + top.modelOffsetMm)) < 1e-12);
});
