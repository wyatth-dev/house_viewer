import type { CameraSnapshot } from '../shared/camera/types.ts';

import type { PhotoRenderRef } from './contract.ts';
export function createCaptureQueue(){let tail:Promise<unknown>=Promise.resolve();return <T>(capture:()=>Promise<T>):Promise<T>=>{const result=tail.then(capture);tail=result.catch(()=>undefined);return result;};}
export async function preparePhotoRender(photo:PhotoRenderRef,capture:(photo:PhotoRenderRef)=>Promise<{blob:Blob;camera?:CameraSnapshot}>,upload:(blob:Blob)=>Promise<string>){
    const shot=await capture(photo);
    if(!shot.camera)throw new Error('The photo camera could not be matched.');
    const camera=structuredClone(shot.camera);
    const sourceUrl=await upload(shot.blob);
    return { sourceUrl,basePhotoUrl:photo.url,camera,mode:'photo' as const };
}
