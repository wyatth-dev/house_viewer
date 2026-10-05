import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import {
    buildProductionList,
    getInstalledFasteners
} from '../src/products/parametric-engine/varenda/production-list.ts';
import { solveVarenda } from '../src/products/parametric-engine/varenda/solution.ts';

test('production list counts installed parts, distinct cuts and shared seals once', () => {
    const solution = solveVarenda(defaultVarendaParams);
    const rows = buildProductionList(solution);
    assert.equal(rows.find((r) => r.catalogProductId === 'varenda-footplate').quantity, 5);
    assert.equal(rows.find((r) => r.catalogProductId === 'varenda-rafter-stand-bolt').quantity, 18);
    assert.equal(rows.find((r) => r.catalogProductId === 'varenda-rafter-stand-nut').quantity, 18);
    assert.equal(rows.filter((r) => r.catalogProductId === 'varenda-glass-panel').length, 2);
    assert.equal(
        rows.filter((r) => r.catalogProductId === 'varenda-glazing-seal-gasket').reduce((n, r) => n + r.quantity, 0),
        2
    );
    assert.ok(rows.every((r) => r.quantity === new Set(r.instanceIds).size));
    assert.equal(
        rows.find((r) => r.catalogProductId === 'fastener-m6-16-din7500c-a2-v1').quantity,
        solution.posts.length * 10
    );
});

test('installed bolt and nut share the measured mirrored bore axis across slopes', () => {
    for (const widthMm of [4000, 5000]) {
        const solution = solveVarenda({ ...defaultVarendaParams, widthMm, wallHeightMm: 2800 });
        const hardware = getInstalledFasteners(solution);
        for (const rafter of solution.rafters) {
            for (const stand of [rafter.stands.front, rafter.stands.rear]) {
                const bolt = hardware.find((h) => h.instanceId === `${stand.instanceId}-bolt`);
                const nut = hardware.find((h) => h.instanceId === `${stand.instanceId}-nut`);
                assert.deepEqual(bolt.positionMm, nut.positionMm);
                assert.deepEqual(bolt.axisUnit, nut.axisUnit);
                assert.ok(Math.abs(Math.hypot(...Object.values(bolt.axisUnit)) - 1) < 1e-10);
                const sign = stand.mirrorX ? -1 : 1;
                assert.ok(Math.abs(bolt.positionMm.x - (stand.positionMm.x + sign * -24.6)) < 0.001);
            }
        }
        assert.equal(
            hardware.length,
            solution.endCaps.fasteners.length + solution.rafterEndCaps.fasteners.length + solution.rafters.length * 4 + solution.posts.length * 10
        );
    }
});

test('production names preserve catalog names verbatim, including every installed fastener', async () => {
    const { varendaCatalog } = await import('../src/products/parametric-engine/varenda/catalog.ts');
    const rows = buildProductionList(solveVarenda(defaultVarendaParams));
    for (const row of rows) {
        const product = Object.values(varendaCatalog).find(
            (product) => product.catalogProductId === row.catalogProductId
        );
        if (product?.productName) assert.equal(row.label, product.productName);
    }
    for (const product of [
        varendaCatalog.screwWaferHead4_2x16,
        varendaCatalog.rafterStandBolt,
        varendaCatalog.rafterStandNut
    ]) {
        assert.equal(rows.find((row) => row.catalogProductId === product.catalogProductId)?.label, product.productName);
    }
});
