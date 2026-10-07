import assert from 'node:assert/strict';
import test from 'node:test';
import { solveVarenda } from '../src/products/parametric-engine/varenda/solution.ts';
import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { buildProductionList } from '../src/products/parametric-engine/varenda/production-list.ts';
import { buildInstallationMenus, buildProductionRelations } from '../src/products/parametric-engine/varenda/production-relations.ts';

test('two nested Ringbeam Clips have separate identities, one catalog row and gutter ownership', () => {
 for(const widthMm of [2000,4000,8000]) {
  const solution=solveVarenda({...defaultVarendaParams,widthMm});
  const clips=solution.ringbeamClips;
  assert.equal(clips.length,2);
  assert.deepEqual(clips.map(c=>c.modelNodeIndex),[0,1]);
  assert.ok(clips.every(c=>c.lengthMm===solution.gutter.lengthMm));
  const row=buildProductionList(solution).find(r=>r.catalogProductId==='varenda-ringbeam-clip');
  assert.equal(row.quantity,2);
  assert.equal(row.label,'SM5360/KL005/6.5 - Veranda Ringbeam Clip');
  assert.deepEqual(row.instanceIds,clips.map(c=>c.instanceId));
  for(const clip of clips) {
   assert.ok(buildInstallationMenus(solution).get('gutter-fixed').includes(clip.instanceId));
   assert.ok(buildProductionRelations(solution).get(clip.instanceId).includes('gutter-fixed'));
  }
 }
});
