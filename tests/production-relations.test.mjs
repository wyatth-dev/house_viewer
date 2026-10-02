import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { buildProductionRelations } from '../src/products/parametric-engine/varenda/production-relations.ts';
import { solveVarenda } from '../src/products/parametric-engine/varenda/solution.ts';

test('relations use installed column and fastening references, including verified column-base screws', () => {
    const solution = solveVarenda(defaultVarendaParams),
        relations = buildProductionRelations(solution);
    const post = solution.posts[0],
        footing = solution.footings.assemblies[0];
    assert.ok(relations.get(post.instanceId).includes(footing.instanceId));
    assert.ok(relations.get(footing.instanceId).includes(post.instanceId));
    const plate = solution.rafters[0].stands.front;
    for (const hardware of plate.fasteners) {
        assert.ok(relations.get(plate.instanceId).includes(hardware.instanceId));
        assert.ok(relations.get(hardware.instanceId).includes(plate.instanceId));
    }
    const connection = solution.endCaps.connections[0];
    assert.ok(relations.get(connection.endCapHoleRef.partInstanceId).includes(connection.fastenerInstanceId));
    assert.ok(relations.get(connection.fastenerInstanceId).includes(connection.endCapHoleRef.partInstanceId));
    const smaller = solveVarenda({ ...defaultVarendaParams, widthMm: 2000 });
    const refreshed = buildProductionRelations(smaller);
    assert.equal(refreshed.has(solution.posts.at(-1).instanceId), false);
});

test('installation menus never reverse footing, gasket or screw ownership', async () => {
    const { buildInstallationMenus } =
        await import('../src/products/parametric-engine/varenda/production-relations.ts');
    const solution = solveVarenda(defaultVarendaParams),
        menus = buildInstallationMenus(solution);
    for (const footing of solution.footings.assemblies) assert.equal(menus.get(footing.instanceId).length, 6);
    for (const post of solution.posts) assert.equal(menus.get(post.instanceId).length, 11);
    for (const gasket of solution.glazing.gaskets) assert.equal(menus.has(gasket.instanceId), false);
    for (const screw of solution.endCaps.fasteners) assert.equal(menus.has(screw.instanceId), false);
    const plate = solution.rafters[0].stands.front;
    assert.deepEqual(
        menus.get(plate.instanceId),
        plate.fasteners.map((part) => part.instanceId)
    );
});
