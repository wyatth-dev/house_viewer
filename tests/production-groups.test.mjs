import assert from 'node:assert/strict';
import test from 'node:test';

import { groupProductionRows } from '../src/product-placement/production-groups.ts';
import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { buildProductionList } from '../src/products/parametric-engine/varenda/production-list.ts';
import { solveVarenda } from '../src/products/parametric-engine/varenda/solution.ts';

test('Gutter is one display assembly containing original fixed and moving catalog parts', () => {
    const rows = buildProductionList(solveVarenda(defaultVarendaParams));
    const grouped = groupProductionRows(rows),
        gutter = grouped.find((row) => row.label === 'Gutter');
    assert.deepEqual(gutter.instanceIds, ['gutter-fixed', 'gutter-moving']);
    assert.equal(gutter.quantity, 2);
    assert.deepEqual(
        gutter.children,
        rows.filter((row) => ['varenda-gutter-fixed', 'varenda-gutter-moving'].includes(row.catalogProductId))
    );
    assert.equal(
        grouped.filter((row) => row.catalogProductId.startsWith('varenda-gutter-') && row.category === 'Profiles')
            .length,
        0
    );
    assert.equal(
        grouped.reduce((n, row) => n + row.quantity, 0),
        rows.reduce((n, row) => n + row.quantity, 0)
    );
    assert.equal(rows.length, grouped.length + 2);
});

test('Wall Piece contains fixed and moving under one selectable group', () => {
    const rows = buildProductionList(solveVarenda(defaultVarendaParams));
    const grouped = groupProductionRows(rows),
        wall = grouped.find((row) => row.label === 'Wall Piece');
    assert.deepEqual(wall.instanceIds, ['wallpiece-fixed', 'wallpiece-moving']);
    assert.equal(wall.quantity, 2);
    assert.equal(wall.children.length, 2);
    assert.ok(
        !grouped.some((row) => ['varenda-wallpiece-fixed', 'varenda-wallpiece-moving'].includes(row.catalogProductId))
    );
});
