import assert from 'node:assert/strict';
import test from 'node:test';

import { rafterDatums } from '../src/parametric-engine/varenda/datums.ts';
import { defaultVarendaParams } from '../src/parametric-engine/varenda/parameters.ts';
import { solveRafterStandPlacements, solveRoofSupportPoints } from '../src/parametric-engine/varenda/varenda-solver.ts';

test('changing stand thickness moves both plate centres along the roof normal without changing slot alignment', () => {
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
