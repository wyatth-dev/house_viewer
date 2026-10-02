import assert from 'node:assert/strict';
import test from 'node:test';

import { rafterDatums } from '../src/parametric-engine/varenda/datums.ts';
import { defaultVarendaParams } from '../src/parametric-engine/varenda/parameters.ts';
import { solveRafterStandPlacements, solveRoofSupportPoints } from '../src/parametric-engine/varenda/varenda-solver.ts';

test('changing stand thickness moves both plate centers along the roof normal without changing slot alignment', () => {
    const original = rafterDatums.stand.thicknessMm;
    try {
        rafterDatums.stand.thicknessMm = 3;
        const before = solveRafterStandPlacements(defaultVarendaParams);
        rafterDatums.stand.thicknessMm = 5;
        const after = solveRafterStandPlacements(defaultVarendaParams);
        const roof = solveRoofSupportPoints(defaultVarendaParams);
        for (const end of ['front', 'rear']) {
            const a = before[end].positionMm;
            const b = after[end].positionMm;
            const dy = b.y - a.y;
            const dz = b.z - a.z;
            assert.ok(Math.abs(dy * roof.normalUnit.y + dz * roof.normalUnit.z - 2) < 1e-9);
            assert.ok(Math.abs(dy * roof.tangentUnit.y + dz * roof.tangentUnit.z) < 1e-9);
            assert.equal(b.x, a.x);
            assert.equal(after[end].mirrorY, before[end].mirrorY);
        }
    } finally {
        if (original === undefined) delete rafterDatums.stand.thicknessMm;
        else rafterDatums.stand.thicknessMm = original;
    }
});

test('one rafter carries two plate instances and four independently countable fasteners', () => {
    const result = solveRafterStandPlacements(defaultVarendaParams);
    const plates = [result.front, result.rear];
    const parts = plates.flatMap((plate) => [plate, ...(plate.fasteners ?? [])]);
    assert.equal(parts.length, 6);
    assert.equal(new Set(parts.map((part) => part.instanceId)).size, 6);
    const counts = new Map();
    for (const part of parts) counts.set(part.catalogProductId, (counts.get(part.catalogProductId) ?? 0) + 1);
    assert.equal(counts.get('varenda-rafter-fixing-plate'), 2);
    assert.equal(counts.get('varenda-rafter-stand-bolt'), 2);
    assert.equal(counts.get('varenda-rafter-stand-nut'), 2);
});
