import { Entity, Color, PROJECTION_PERSPECTIVE } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { Frame } from '../shared/camera/framing.ts';
/** A temporary exact-pose camera captures all current scene products at the photograph's aspect ratio. */
export async function captureMatchedScene(app:AppBase,canvas:HTMLCanvasElement,frame:Frame,size:{width:number;height:number}):Promise<Blob>{
    const scale=Math.min(1,1600/Math.max(size.width,size.height));
    const width=Math.max(1,Math.round(size.width*scale)),height=Math.max(1,Math.round(size.height*scale));
    const screen={ width:canvas.clientWidth,height:canvas.clientHeight };
    const active=app.root.findComponents('camera').filter(component=>component.entity.enabled);
    const camera=new Entity('Photo matched capture camera');
    camera.addComponent('camera',{ projection:PROJECTION_PERSPECTIVE,fov:2*Math.atan(frame.tanHalfFov!)*180/Math.PI,
        nearClip:Math.max(1,frame.near),farClip:frame.far,clearColor:new Color(.98,.984,.988) });
    // Match the visible scene's exposure/tone settings, while retaining the solved lens and roll.
    if(active[0])camera.camera!.toneMapping=active[0].entity.camera!.toneMapping;
    camera.setPosition(frame.position.x,frame.position.y,frame.position.z);
    camera.lookAt(frame.center.x,frame.center.y,frame.center.z,frame.up.x,frame.up.y,frame.up.z);
    app.root.addChild(camera);
    const output=document.createElement('canvas');output.width=width;output.height=height;
    try {
        for(const component of active)component.entity.enabled=false;
        app.resizeCanvas(width,height);
        app.render();
        output.getContext('2d')!.drawImage(canvas,0,0,width,height);
    } finally {
        camera.destroy();
        for(const component of active)component.entity.enabled=true;
        app.resizeCanvas(screen.width,screen.height);
        app.render();
    }
    return new Promise<Blob>((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(new Error('The matched photo view could not be captured.')),'image/jpeg',.92));
}
