import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { buildProductionList } from '../src/products/parametric-engine/varenda/production-list.ts';
import { buildInstallationMenus } from '../src/products/parametric-engine/varenda/production-relations.ts';
import { solveVarenda } from '../src/products/parametric-engine/varenda/solution.ts';

test('Column and Footplate reference the same six independently counted M6 screws at measured base holes', () => {
    for (const undersideHeightMm of [1600, 2200]) {
        const solution = solveVarenda({ ...defaultVarendaParams, undersideHeightMm });
        const menus = buildInstallationMenus(solution);
        for (const post of solution.posts) {
            const footing = solution.footings.assemblies.find((part) => part.columnId === post.columnId);
            const ids = menus.get(footing.instanceId);
            assert.equal(ids.length, 6);
            assert.ok(ids.every((id) => menus.get(post.instanceId).includes(id)));
            for (const connection of solution.columnFasteners.connections.filter(
                (c) => c.columnId === post.columnId && c.partInstanceIds.includes(footing.instanceId)
            )) {
                assert.deepEqual(connection.partInstanceIds, [post.instanceId, footing.instanceId]);
                assert.equal(connection.alignment, 'coaxial');
                const screw = solution.columnFasteners.fasteners.find(
                    (s) => s.instanceId === connection.fastenerInstanceIds[0]
                );
                const hole = post.holeMarkers.find((h) => h.markerId === connection.holeRefs[0].operationId);
                assert.equal(screw.positionMm.z, post.positionMm.z + hole.centerMm.z);
                assert.ok([30, 55].includes(screw.positionMm.z));
                assert.equal(screw.positionMm.x, post.positionMm.x + hole.centerMm.x);
                assert.equal(screw.axisUnit.x, hole.faceId === 'x-positive' ? -1 : 1);
            }
        }
        const row = buildProductionList(solution).find(
            (row) => row.catalogProductId === 'fastener-m6-16-din7500c-a2-v1'
        );
        assert.equal(row.quantity, solution.posts.length * 10);
        assert.equal(new Set(row.instanceIds).size, row.quantity);
    }
});

test('four M6 top screws share Column/Gutter references and follow height without moving base screws', () => {
    const low = solveVarenda(defaultVarendaParams);
    const high = solveVarenda({
        ...defaultVarendaParams,
        undersideHeightMm: defaultVarendaParams.undersideHeightMm + 200
    });
    for (const post of low.posts) {
        const top = low.columnFasteners.connections.filter(
            (c) => c.columnId === post.columnId && c.partInstanceIds.includes('gutter-fixed')
        );
        assert.equal(top.length, 4);
        for (const connection of top) {
            const id = connection.fastenerInstanceIds[0];
            const a = low.columnFasteners.fasteners.find((s) => s.instanceId === id);
            const b = high.columnFasteners.fasteners.find((s) => s.instanceId === id);
            assert.equal(a.catalogProductId, 'fastener-m6-16-din7500c-a2-v1');
            assert.equal(b.positionMm.z - a.positionMm.z, 200);
            assert.equal(a.axisUnit.x, 0);
            assert.equal(Math.abs(a.axisUnit.y), 1);
            assert.ok(buildInstallationMenus(low).get(post.instanceId).includes(id));
            assert.ok(buildInstallationMenus(low).get('gutter-fixed').includes(id));
        }
    }
    for (const a of low.columnFasteners.fasteners.filter((s) => s.instanceId.includes('footplate'))) {
        assert.deepEqual(
            high.columnFasteners.fasteners.find((b) => b.instanceId === a.instanceId).positionMm,
            a.positionMm
        );
    }
});
