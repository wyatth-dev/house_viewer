import assert from 'node:assert/strict';
import test from 'node:test';
import { renderProductionList } from '../src/product-placement/production-list.ts';
import { solveVarenda } from '../src/products/parametric-engine/varenda/solution.ts';
import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { buildProductionList } from '../src/products/parametric-engine/varenda/production-list.ts';

test('clip buttons retain instance markers while selected text and detail heading use catalog name', () => {
 class Element {
  children=[];textContent='';className='';attributes={};classList={toggle(){}};
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
  setAttribute(key,value){this.attributes[key]=value;}
 }
 const previousDocument=globalThis.document,previousWindow=globalThis.window;
 globalThis.document={createElement:()=>new Element()};globalThis.window={scrollY:0,scrollTo(){}};
 try {
  const rows=buildProductionList(solveVarenda(defaultVarendaParams));
  const clip=rows.find(row=>row.catalogProductId==='varenda-ringbeam-clip');
  const id=clip.instanceIds[0],host=new Element();
  renderProductionList(host,rows,clip.id,()=>{},{id,path:[id]},()=>{},new Map([[clip.id,new Set([id])]]));
  const visit=e=>[e,...e.children.flatMap(visit)];const elements=visit(host);
  const tags=elements.find(e=>e.className==='instance-tags');
  assert.deepEqual(tags.children.map(e=>e.textContent),['Ringbeam Clip 1','Ringbeam Clip 2']);
  assert.ok(elements.some(e=>e.textContent===`Selected: ${clip.label}`));
  const detail=elements.find(e=>e.className==='inline-screw-list');
  assert.equal(detail.children[0].textContent,`${clip.label} · Installed parts`);
 } finally {globalThis.document=previousDocument;globalThis.window=previousWindow;}
});

test('Gutter exposes Ringbeam and Ringbeam Swivel using the chart names', async () => {
 const { groupProductionRows }=await import('../src/product-placement/production-groups.ts');
 const { catalogInstanceLabel }=await import('../src/product-placement/production-list.ts');
 const rows=groupProductionRows(buildProductionList(solveVarenda(defaultVarendaParams)));
 assert.equal(catalogInstanceLabel('gutter-fixed',rows),'5110010010 - Veranda Ringbeam');
 assert.equal(catalogInstanceLabel('gutter-moving',rows),'5110010015 - Veranda Ringbeam Swivel');
 const gutter=rows.find(r=>r.catalogProductId==='assembly:gutter');
 assert.ok(gutter.children.some(r=>r.label==='5110010015 - Veranda Ringbeam Swivel'));
});

test('component frontend follows containment and renders only group labels and catalog names',async()=>{
 const {renderComponentTree}=await import('../src/product-placement/production-list.ts');
 class Element {
  children=[];textContent='';className='';attributes={};classList={toggle(){}};
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
  setAttribute(key,value){this.attributes[key]=value;}
 }
 const previousDocument=globalThis.document,previousWindow=globalThis.window;
 globalThis.document={createElement:()=>new Element()};globalThis.window={scrollY:0,scrollTo(){}};
 try {
  const data=solveVarenda(defaultVarendaParams).componentData;
  const flatten=n=>[n,...(n.kind==='assembly'?n.children.flatMap(flatten):[])];
  const all=flatten(data.root),host=new Element();let selected;
  renderComponentTree(host,data,new Set(all.filter(n=>n.kind==='assembly').map(n=>n.id)),undefined,id=>{selected=id;});
  const verify=(node,element)=>{
   const button=element.children[0];
   if(node.kind==='assembly') {
    assert.equal(button.textContent,node.label);
    assert.equal(element.children[1].children.length,node.children.length);
    node.children.forEach((child,index)=>verify(child,element.children[1].children[index]));
   }else{
    const instance=data.instances.find(p=>p.id===node.instanceId);
    const product=data.products.find(p=>p.id===instance.productId);
    assert.equal(button.textContent,product.manufacturerCode?`${product.manufacturerCode} - ${product.name}`:product.name);
    assert.equal(element.children.length,1);
    button.onclick();assert.equal(selected,node.instanceId);
   }
  };
  assert.equal(host.children.length,data.root.children.length);
  data.root.children.forEach((node,index)=>verify(node,host.children[index]));
 }finally{globalThis.document=previousDocument;globalThis.window=previousWindow;}
});
