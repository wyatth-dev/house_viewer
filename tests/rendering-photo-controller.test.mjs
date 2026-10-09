import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderingController} from '../src/rendering/controller.ts';
class Element extends EventTarget {
 constructor(){super();this.children=[];this.dataset={};this.hidden=false;this.attributes={};this.className='';this.classList={add:name=>this.className+=' '+name,toggle:()=>{}};}
 append(...children){this.children.push(...children);} replaceChildren(...children){this.children=children;}
 setAttribute(name,value){this.attributes[name]=value;} scrollTo(){} scrollBy(){} focus(){}
}
const settle=()=>new Promise(r=>setTimeout(r,5));
const photo={url:'/files/p/house-001/photos/a.jpg',name:'Original',file:'photos/a.jpg'};
const initial=()=>({id:'p',house:{source:'photo',typologyId:'house-001'},media:{references:[],renders:[]}});
async function fixture(t,capturePhotoView,matchPhotoView=async()=>{}){
 const previous={document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,requestAnimationFrame:globalThis.requestAnimationFrame,fetch:globalThis.fetch,Image:globalThis.Image};
 globalThis.Image=class{async decode(){}};
 globalThis.document={createElement:()=>new Element(),querySelector:()=>({})};
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=fn=>queueMicrotask(fn);
 let document=initial(),requests=[],state='queued',postGate=Promise.resolve();
 globalThis.fetch=async(url,init)=>{
  const reply=(result)=>new Response(JSON.stringify({ok:true,result}),{headers:{'Content-Type':'application/json'}});
  if(url==='/api/render-options')return reply({groups:[]});
  if(url.endsWith('/media/captures')){requests.push({type:'upload',body:init.body});return reply({files:[{url:'/data/projects/p/media/captures/hidden.jpg',name:'capture.jpg'}]});}
  if(url==='/api/projects/p/renders'){requests.push({type:'render',body:JSON.parse(init.body)});await postGate;return reply({render:{id:'r1',state:'queued'}});}
  if(url==='/api/projects/p/renders/r1')return reply({render:{id:'r1',state,resultUrl:state==='done'?'/result.jpg':null,error:null}});
  throw new Error('Unexpected API '+url);
 };
 const elements=Object.fromEntries(['queue','photos','photosSection','contextButton','contextCount','options','message'].map(k=>[k,new Element()]));
 const options={projectId:'p',autosave:{get:()=>document,update:fn=>document=fn(document)},elements,captureView:async()=>{throw new Error('Must match the photo');},capturePhotoView,matchPhotoView,restoreCamera:()=>{},loadHousePhoto:async()=>null,pollMs:1};
 const controller=createRenderingController(options);controller.setPhotos([photo]);await settle();
 t.after(()=>{controller.destroy();Object.assign(globalThis,previous);});
 const render=()=>elements.photos.children[0].children[2].onclick();
 return {controller,render,elements,requests,get:()=>document,done:()=>state='done',holdPost:()=>{let release;postGate=new Promise(r=>release=r);return ()=>release();},switchHouse:()=>{document={...document,house:{source:'photo',typologyId:'house-002'}};controller.setPhotos([]);}};
}
test('From photos uses identical loading/completed card states while submitting a hidden matched screenshot',async t=>{
 let release;const ready=new Promise(r=>release=r);let matches=0;
 const f=await fixture(t,async()=>{matches++;await ready;return {blob:new Blob(['matched-model-with-product']),camera:{frame:{position:{x:1}}}};});
 f.render();f.render();assert.equal(matches,1);assert.equal(f.elements.photos.children[0].dataset.state,'queued');assert.equal(f.requests.length,0);
 release();await settle();
 const payload=f.requests.find(r=>r.type==='render').body;
 assert.equal(payload.sourceUrl,'/data/projects/p/media/captures/hidden.jpg');assert.deepEqual(payload.contextUrls,[photo.url]);
 assert.deepEqual(f.get().media.references,[],'hidden screenshot is absent from From model');assert.equal(f.get().media.renders[0].basePhotoUrl,photo.url);
 f.done();await settle();await settle();assert.equal(f.elements.photos.children[0].dataset.state,'done');
 assert.equal(f.elements.photos.children[0].children[0].children[0].src,'/result.jpg');assert.equal(f.elements.photos.children[0].children[2].textContent,'Render again');
 f.controller.setPhotos([]);f.controller.setPhotos([photo]);assert.equal(f.elements.photos.children[0].dataset.state,'done','completed card survives leaving and reopening rendering');
});
test('matching failures show a retryable failed photo card without calling rendering',async t=>{
 let shouldFail=true;const f=await fixture(t,async()=>{if(shouldFail)throw new Error('No measured corners');return {blob:new Blob(['matched']),camera:{frame:{position:{x:1}}}};});
 f.render();await settle();assert.equal(f.elements.photos.children[0].dataset.state,'failed');assert.equal(f.get().media.renders[0].error,'No measured corners');assert.equal(f.requests.length,0);
 shouldFail=false;f.render();await settle();assert.equal(f.get().media.renders.length,1);assert.equal(f.get().media.renders[0].status,'queued');assert.equal(f.requests.filter(r=>r.type==='render').length,1);
});

test('a house switch during render submission cannot attach the old photo job to the new house',async t=>{
 const f=await fixture(t,async()=>({blob:new Blob(['matched']),camera:{frame:{position:{x:1}}}}));
 const release=f.holdPost();f.render();await settle();assert.equal(f.requests.filter(r=>r.type==='render').length,1);
 f.switchHouse();release();await settle();assert.deepEqual(f.get().media.renders,[]);
});

test('clicking the photograph only matches the camera without capturing or rendering',async t=>{
 let matches=0,captures=0;const f=await fixture(t,async()=>{captures++;throw new Error('Photo click must not capture');},async selected=>{assert.equal(selected,photo);matches++;});
 f.elements.photos.children[0].children[0].onclick();await settle();
 assert.equal(matches,1);assert.equal(captures,0);assert.equal(f.requests.length,0);assert.deepEqual(f.get().media.renders,[]);
});
