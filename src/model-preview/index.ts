import { Color, Entity, Layer, PIXELFORMAT_RGBA8, PROJECTION_ORTHOGRAPHIC, RenderTarget, Texture } from 'playcanvas';
import type { AppBase, MeshInstance } from 'playcanvas';

import { fitOrthographic } from '../camera/framing.ts';
import type { Bounds3 } from '../geometry/types.ts';

/** Render the supplied model once. The returned image remains cached until destroy(). */
export function createModelPreview(app: AppBase, model: Entity, bounds: Bounds3) {
    const width = 320,
        height = 240;
    const layer = new Layer({ name: 'Model thumbnail' });
    const meshes: MeshInstance[] = [];
    model.forEach((node) => {
        if (node instanceof Entity && node.render) meshes.push(...node.render.meshInstances);
    });
    layer.addMeshInstances(meshes);
    app.scene.layers.push(layer);
    const texture = new Texture(app.graphicsDevice, { width, height, format: PIXELFORMAT_RGBA8, mipmaps: false });
    const target = new RenderTarget({ colorBuffer: texture, depth: true });
    const camera = new Entity('Thumbnail camera');
    const frame = fitOrthographic(bounds, { width, height }, { x: 1, y: 1, z: 1 });
    camera.addComponent('camera', {
        layers: [layer.id],
        projection: PROJECTION_ORTHOGRAPHIC,
        orthoHeight: frame.halfHeight,
        nearClip: frame.near,
        farClip: frame.far,
        clearColor: new Color(0.929, 0.945, 0.914, 1),
        renderTarget: target
    });
    camera.setPosition(frame.position.x, frame.position.y, frame.position.z);
    camera.lookAt(frame.center.x, frame.center.y, frame.center.z);
    const light = new Entity('Thumbnail light');
    light.addComponent('light', { type: 'directional', layers: [layer.id], intensity: 1.25 });
    light.setEulerAngles(50, -30, 0);
    app.root.addChild(camera);
    app.root.addChild(light);
    let disposed = false;
    let released = false;
    let url: string | undefined;
    const release = () => {
        if (released) return;
        released = true;
        camera.destroy();
        light.destroy();
        layer.removeMeshInstances(meshes);
        app.scene.layers.remove(layer);
        target.destroy();
        texture.destroy();
    };
    const ready = (async () => {
        try {
            app.render();
            camera.enabled = false;
            const pixels = await texture.read(0, 0, width, height, { renderTarget: target, immediate: true });
            if (disposed) return undefined;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Thumbnail image conversion is unavailable.');
            const image = context.createImageData(width, height);
            // WebGL readback starts at the bottom; image data starts at the top.
            for (let row = 0; row < height; row++) {
                const sourceRow = app.graphicsDevice.isWebGPU ? row : height - 1 - row;
                image.data.set(pixels.subarray(sourceRow * width * 4, (sourceRow + 1) * width * 4), row * width * 4);
            }
            context.putImageData(image, 0, 0);
            const blob = await new Promise<Blob>((resolve, reject) =>
                canvas.toBlob((value) => {
                    if (value) resolve(value);
                    else reject(new Error('Thumbnail encoding failed.'));
                }, 'image/png')
            );
            if (disposed) return undefined;
            url = URL.createObjectURL(blob);
            return url;
        } finally {
            release();
        }
    })();
    return {
        ready,
        destroy() {
            disposed = true;
            release();
            if (url) URL.revokeObjectURL(url);
        }
    };
}
