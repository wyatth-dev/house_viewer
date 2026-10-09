import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePhotoRender, createCaptureQueue} from '../src/rendering/photo-flow.ts';
const photo={url:'/files/p/house/photos/p1.jpg',file:'photos/p1.jpg',name:'House photo'};
test('photo rendering submits a matched model screenshot and keeps the original as Before',async()=>{
 const events=[];const shot=new Blob(['model pixels']);const camera={frame:{position:{x:42}}};
 const result=await preparePhotoRender(photo,async chosen=>{assert.equal(chosen,photo);events.push('match and capture');return {blob:shot,camera};},async blob=>{assert.equal(blob,shot);events.push('upload');return '/data/projects/p/media/captures/matched.jpg';});
 assert.deepEqual(events,['match and capture','upload']);assert.equal(result.sourceUrl,'/data/projects/p/media/captures/matched.jpg');assert.equal(result.basePhotoUrl,photo.url);assert.equal(result.mode,'photo');
 camera.frame.position.x=99;assert.equal(result.camera.frame.position.x,42,'saved camera is frozen');
});
test('a matching failure prevents screenshot upload',async()=>{
 let uploads=0;await assert.rejects(()=>preparePhotoRender(photo,async()=>{throw new Error('No landmarks');},async()=>{uploads++;return 'wrong';}),/No landmarks/);assert.equal(uploads,0);
});
test('captures use a serialized camera and recover after a capture fails',async()=>{
 const run=createCaptureQueue();let release;const wait=new Promise(r=>release=r);const events=[];
 const a=run(async()=>{events.push('a');await wait;throw new Error('bad capture');});
 const b=run(async()=>{events.push('b');return 'second capture';});
 await Promise.resolve();assert.deepEqual(events,['a']);release();await assert.rejects(()=>a,/bad capture/);assert.equal(await b,'second capture');assert.deepEqual(events,['a','b']);
});
