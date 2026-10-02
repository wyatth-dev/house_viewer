import assert from 'node:assert/strict';
import test from 'node:test';

import * as glazing from '../src/products/parametric-engine/varenda/glazing-solver.ts';
import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { solveRafters } from '../src/products/parametric-engine/varenda/varenda-solver.ts';
const close = (a,b) => assert.ok(Math.abs(a-b)<0.00001, `${a} != ${b}`);

test('glass reproduces the measured engineer bay with distinct end and regular offsets', () => {
 const p = defaultVarendaParams;
 const template = solveRafters(p)[0];
 const angle = 5*Math.PI/180, c=Math.cos(angle),s=Math.sin(angle);
 const at=(x,t,n)=>({ x,y:c*t-s*n,z:s*t+c*n });
 const rafters=[['left',771.8625953247,'end'],['right',1171.9962871546,'regular']].map(([id,x,bodyKind])=>({
  ...template, instanceId:id, bodyKind, mirrorX:false, slopeRadians:angle,
  frontMm:at(x,-436.37234062539,201.9074655742),rearMm:at(x,-113.59923159758,201.9074655742),
  lengthMm:322.77310902781,positionMm:at(x,(-436.37234062539-113.59923159758)/2,201.9074655742)
 }));
 const result=glazing.solveGlazing(p,rafters),glass=result.glass[0];
 close(glass.widthMm,380.8836918299); close(glass.lengthMm,342.68093165659); close(glass.thicknessMm,6);
 close(glass.positionMm.x,967.55444123965);
 close(-s*glass.positionMm.y+c*glass.positionMm.z,214.1080075742);
 assert.deepEqual(glass.bayRef,{ leftRafterInstanceId:'left',rightRafterInstanceId:'right' });
 const sides=result.gaskets.filter(g=>g.lengthAxis==='y'); assert.equal(sides.length,6);
 for(const g of sides)close(g.lengthMm,322.77310902781);
 for(const link of result.installations.filter(i=>i.glassRef))assert.equal(link.glassRef.instanceId,glass.instanceId);
});

test('glazing IDs, references and quantities remain distinct when bays share continuous rail seals', () => {
 for(const widthMm of [2000,4000,8000]) {
  const p={ ...defaultVarendaParams,widthMm };const rafters=solveRafters(p);const result=glazing.solveGlazing(p,rafters);
  assert.equal(result.glass.length,rafters.length-1);assert.equal(result.gaskets.length,6*(rafters.length-1)+4);
  assert.equal(new Set([...result.glass,...result.gaskets].map(g=>g.instanceId)).size,result.glass.length+result.gaskets.length);
  const rails=result.gaskets.filter(g=>g.lengthAxis==='x'); assert.equal(rails.length,4);
  for(const g of rails)close(g.lengthMm,widthMm);
  const groups=glazing.summarizeGlazingParts(result);
  assert.equal(groups.find(g=>g.catalogProductId==='varenda-glazing-seal-gasket').quantity,2);
  for(const link of result.installations) {
   assert.ok(result.gaskets.some(g=>g.instanceId===link.gasketInstanceId));
   if(link.glassRef) assert.ok(result.glass.some(g=>g.instanceId===link.glassRef.instanceId));
  }
 }
});

test('invalid and inconsistent glass bays fail before any scene replacement',()=>{
 const p=defaultVarendaParams,rafters=solveRafters(p);
 assert.throws(()=>glazing.solveGlazing(p,[rafters[1],rafters[0]]));
 assert.throws(()=>glazing.solveGlazing(p,[rafters[0],{ ...rafters[1],slopeRadians:0 }]));
 assert.throws(()=>glazing.solveGlazing(p,[rafters[0],{ ...rafters[1],frontMm:{ ...rafters[1].frontMm,z:NaN } }]));
});

test('glass rendering keeps thickness and gasket cross sections fixed and omits hidden details',async()=>{
 const { Entity }=await import('playcanvas'); const { createVarendaView }=await import('../src/products/varenda/view/varenda-view.ts');
 const { solveGutterLayout,solveWallPieceLayout,solveRoofSlope }=await import('../src/products/parametric-engine/varenda/varenda-solver.ts');
 const app={ root:new Entity('scene') };app.root._enabledInHierarchy=true;const assets={ load:async()=>({ instantiateRenderEntity:()=>new Entity('mesh') }) };
 const view=await createVarendaView(app,assets);
 try {
  for(const depthMm of [1000,2000,4000]) {
   const p={ ...defaultVarendaParams,depthMm };const result=glazing.solveGlazing(p);
   view.update({ footings:{ assemblies:[] },posts:[],gutter:solveGutterLayout(p),wallPiece:solveWallPieceLayout(p),roofSlope:solveRoofSlope(p),glazing:result });
   const glass=result.glass[0],e=view.root.findByName(glass.instanceId);assert.ok(e);
   close(e.getLocalScale().y,6);close(e.getLocalScale().x,glass.widthMm);close(e.getLocalScale().z,glass.lengthMm);
   for(const gasket of result.gaskets.filter(g=>g.lengthAxis==='y')) {
    const entity=view.root.findByName(gasket.instanceId);assert.ok(entity);assert.equal(entity.enabled,false);
    close(Math.abs(entity.getLocalScale().x),1);close(entity.getLocalScale().y,1);close(entity.getLocalScale().z,gasket.lengthMm/100);
   }
   for(const gasket of result.gaskets.filter(g=>g.lengthAxis==='x'))assert.equal(view.root.findByName(gasket.instanceId),null);
   view.setGlazingDetailVisible(true);assert.equal(view.root.findByName(result.gaskets[0].instanceId).enabled,true);
   view.setGlazingDetailVisible(false);
  }
 } finally {view.destroy();app.root.destroy();}
});
