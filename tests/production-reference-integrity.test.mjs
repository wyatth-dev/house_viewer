import assert from 'node:assert/strict';
import test from 'node:test';

import { varendaCatalog } from '../src/products/parametric-engine/varenda/catalog.ts';
import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import {
    buildProductionList,
    getInstalledFasteners
} from '../src/products/parametric-engine/varenda/production-list.ts';
import {
    buildInstallationMenus,
    buildProductionRelations
} from '../src/products/parametric-engine/varenda/production-relations.ts';
import { solveVarenda } from '../src/products/parametric-engine/varenda/solution.ts';

test('solved connections, installation menus and inventory reference actual unique parts across parameter changes', () => {
    for (const widthMm of [2000, 4000, 6000])
        for (const undersideHeightMm of [1400, 1800]) {
            const solution = solveVarenda({ ...defaultVarendaParams, widthMm, undersideHeightMm });
            const rows = buildProductionList(solution);
            const ids = rows.flatMap((row) => row.instanceIds);
            const parts = new Set(ids);
            assert.equal(parts.size, ids.length, 'one physical instance must occur in inventory only once');
            const catalogIds = new Set(Object.values(varendaCatalog).map((product) => product.catalogProductId));
            for (const row of rows) assert.ok(catalogIds.has(row.catalogProductId));
            const hardware = getInstalledFasteners(solution),
                hardwareIds = new Set(hardware.map((part) => part.instanceId));
            assert.equal(hardwareIds.size, hardware.length);
            for (const screw of hardware) {
                assert.ok(parts.has(screw.instanceId));
                assert.ok(Object.values(screw.positionMm).every(Number.isFinite));
                assert.ok(Math.abs(Math.hypot(...Object.values(screw.axisUnit)) - 1) < 1e-9);
            }
            const connectionIds = [...solution.columnFasteners.connections, ...solution.endCaps.connections].map(
                (c) => c.connectionId
            );
            assert.equal(new Set(connectionIds).size, connectionIds.length);
            for (const connection of solution.columnFasteners.connections) {
                for (const id of connection.partInstanceIds) assert.ok(parts.has(id), `unresolved part ${id}`);
                for (const id of connection.fastenerInstanceIds) assert.ok(hardwareIds.has(id));
                for (const ref of connection.holeRefs) {
                    const post = solution.posts.find((post) => post.instanceId === ref.partInstanceId);
                    assert.ok(post?.holeMarkers.some((hole) => hole.markerId === ref.operationId));
                }
            }
            for (const connection of solution.endCaps.connections) {
                const ref = connection.endCapHoleRef;
                assert.ok(
                    solution.endCaps.plates
                        .find((plate) => plate.instanceId === ref.partInstanceId)
                        ?.holes.some((hole) => hole.operationId === ref.operationId)
                );
                assert.ok(hardwareIds.has(connection.fastenerInstanceId));
                assert.ok(parts.has(`${connection.railRef.instanceId}-fixed`));
            }
            for (const rafter of solution.rafters)
                for (const plate of [rafter.stands.front, rafter.stands.rear]) {
                    assert.ok(parts.has(plate.instanceId));
                    for (const fastener of plate.fasteners) assert.ok(hardwareIds.has(fastener.instanceId));
                }
            for (const installation of solution.glazing.installations) {
                assert.ok(parts.has(installation.gasketInstanceId));
                if (installation.glassRef) assert.ok(parts.has(installation.glassRef.instanceId));
                const support = installation.supportRef.instanceId;
                assert.ok(parts.has(support === 'gutter' || support === 'wallpiece' ? `${support}-moving` : support));
            }
            for (const graph of [buildProductionRelations(solution), buildInstallationMenus(solution)])
                for (const [id, references] of graph) {
                    assert.ok(parts.has(id), `unresolved owner ${id}`);
                    assert.equal(new Set(references).size, references.length);
                    for (const ref of references) assert.ok(parts.has(ref), `unresolved reference ${ref}`);
                }
        }
});
