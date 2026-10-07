import assert from 'node:assert/strict';
import test from 'node:test';
import { solveVarenda } from '../src/products/parametric-engine/varenda/solution.ts';
import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { containedInstanceIds } from '../src/products/parametric-engine/varenda/component-data.ts';
import { buildProductionList } from '../src/products/parametric-engine/varenda/production-list.ts';
const nodes = root => [root,...(root.kind==='assembly'?root.children.flatMap(nodes):[])];
const assembly = (data,id) => nodes(data.root).find(n=>n.kind==='assembly'&&n.id===`assembly:${id}`);

test('containment owns every product instance exactly once and preserves all original model references',()=>{
 for(const widthMm of [2000,4000,8000]) for(const depthMm of [1000,2500]) {
  const solution=solveVarenda({...defaultVarendaParams,widthMm,depthMm});const data=solution.componentData;
  const ids=containedInstanceIds(data.root);
  assert.equal(ids.length,new Set(ids).size);
  assert.deepEqual(ids.sort(),data.instances.map(p=>p.id).sort());
  assert.equal(new Set(nodes(data.root).filter(n=>n.kind==='assembly').map(n=>n.id)).size,nodes(data.root).filter(n=>n.kind==='assembly').length);
  assert.ok(nodes(data.root).filter(n=>n.kind==='assembly').every(n=>!('productId' in n)));
  const originals=buildProductionList(solution).flatMap(r=>r.instanceIds);
  assert.deepEqual(data.instances.flatMap(p=>p.geometryInstanceIds).sort(),originals.sort());
  assert.ok(data.instances.every(p=>data.products.some(product=>product.id===p.productId)));
  assert.ok(data.relations.every(r=>r.instanceIds.every(id=>ids.includes(id))));
  assert.ok(data.instances.filter(p=>p.productId==='varenda-glazing-wedge-gasket').every(p=>p.geometryInstanceIds.length===2));
  assert.ok(data.instances.filter(p=>p.productId==='varenda-glazing-support-gasket').every(p=>p.geometryInstanceIds.length===1));
 }
});

test('Column contains its Footplate and ten screws; Gutter is related to top screws but does not contain them',()=>{
 const solution=solveVarenda(defaultVarendaParams),data=solution.componentData;
 const gutterIds=containedInstanceIds(assembly(data,'gutter'));
 for(const post of solution.posts) {
  const column=assembly(data,post.columnId);
  const footing=solution.footings.assemblies.find(f=>f.columnId===post.columnId);
  const base=containedInstanceIds(assembly(data,footing.instanceId));
  assert.equal(base.length,7);assert.ok(base.includes(footing.instanceId));
  const columnIds=containedInstanceIds(column);assert.equal(columnIds.length,12);
  assert.ok(columnIds.includes(post.instanceId));assert.ok(base.every(id=>columnIds.includes(id)));
  const top=containedInstanceIds(assembly(data,`${post.columnId}:top-fastening`));assert.equal(top.length,4);
  for(const screw of top) {
   assert.equal(gutterIds.includes(screw),false);
   assert.ok(data.relations.some(r=>r.instanceIds.includes(screw)&&r.instanceIds.includes('gutter-fixed')));
  }
 }
});

test('Fixed Moving and Caps are siblings; plate and cap fasteners are contained recursively',()=>{
 const solution=solveVarenda(defaultVarendaParams),data=solution.componentData;
 for(const rail of ['gutter','wallpiece']) {
  assert.deepEqual(assembly(data,rail).children.map(n=>n.label),['Fixed','Moving','Gaskets','Left Cap','Right Cap']);
  const moving=containedInstanceIds(assembly(data,`${rail}:moving`));
  const gasketIds=containedInstanceIds(assembly(data,`${rail}:gaskets`));
  assert.ok(gasketIds.length>0);
  for(const gasket of gasketIds) {
   assert.equal(moving.includes(gasket),false);
   assert.ok(data.relations.some(r=>r.instanceIds.includes(gasket)&&r.instanceIds.includes(`${rail}-moving`)));
  }
  for(const cap of solution.endCaps.plates.filter(c=>c.railRef.instanceId===rail)) {
   assert.equal(moving.includes(cap.instanceId),false);
   const capIds=containedInstanceIds(assembly(data,cap.instanceId));
   assert.ok(capIds.includes(cap.instanceId));
   for(const c of solution.endCaps.connections.filter(c=>c.endCapHoleRef.partInstanceId===cap.instanceId))assert.ok(capIds.includes(c.fastenerInstanceId));
  }
 }
 for(const rafter of solution.rafters) {
  const ownerIds=containedInstanceIds(assembly(data,rafter.instanceId));
  for(const plate of [rafter.stands.front,rafter.stands.rear]) {
   const ids=containedInstanceIds(assembly(data,plate.instanceId));
   assert.equal(ids.length,3);assert.ok(ids.every(id=>ownerIds.includes(id)));
   assert.ok(ids.includes(plate.instanceId));for(const fastener of plate.fasteners)assert.ok(ids.includes(fastener.instanceId));
  }
 }
 const postProduct=data.products.find(p=>p.id==='varenda-post-profile');
 assert.equal(postProduct.manufacturerCode,'5110010045');assert.equal(postProduct.name,'Veranda Post');
 assert.equal(data.products.find(p=>p.id==='varenda-wallpiece-fixed').status,'pending');
 const seal=data.products.find(p=>p.id==='varenda-glazing-seal-gasket');
 assert.equal(seal.manufacturerCode,'5120010020');
 assert.equal(seal.name,'Glazing Flipper Gasket');
 assert.equal(seal.status,'confirmed');
});
