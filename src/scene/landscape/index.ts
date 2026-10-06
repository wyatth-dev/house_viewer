import { Color, Entity, PIXELFORMAT_RGBA8, StandardMaterial, Texture } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { Bounds3 } from '../../shared/geometry/types.ts';

import { landscapeLayout } from './layout.ts';

export { landscapeLayout } from './layout.ts';

export function createLandscape(app: AppBase) {
    const root = new Entity('Landscape context');
    app.root.addChild(root);
    const asphalt = new StandardMaterial(),
        edging = new StandardMaterial();
    asphalt.diffuse = new Color().fromString('#545A5D');
    asphalt.gloss = 0.12;
    const size = 128,
        pixels = new Uint8Array(size * size * 4);
    let seed = 37;
    for (let i = 0; i < pixels.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const v = 218 + (seed % 25);
        pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
        pixels[i + 3] = 255;
    }
    const texture = new Texture(app.graphicsDevice, {
        name: 'Asphalt grain',
        width: size,
        height: size,
        format: PIXELFORMAT_RGBA8,
        levels: [pixels],
        mipmaps: true
    });
    asphalt.diffuseMap = texture;
    asphalt.diffuseMapTiling.set(2400, 6);
    asphalt.update();
    edging.diffuse = new Color().fromString('#B7B4A8');
    edging.gloss = 0;
    edging.update();
    const surface = new Entity('Road outside front yard'),
        shoulders = new Entity('Road edging');
    for (const [entity, material] of [
        [surface, asphalt],
        [shoulders, edging]
    ] as const) {
        entity.addComponent('render', { type: 'plane', material, castShadows: false, receiveShadows: true });
        root.addChild(entity);
    }
    return {
        setVisible(value: boolean) {
            root.enabled = value;
        },
        updateBounds(property: Bounds3) {
            const layout = landscapeLayout(property);
            surface.setPosition(0, -35, layout.road.z);
            surface.setLocalScale(layout.road.length, 1, layout.road.width);
            shoulders.setPosition(0, -45, layout.road.z);
            shoulders.setLocalScale(layout.road.length, 1, layout.road.width + layout.road.shoulder * 2);
        },
        destroy() {
            root.destroy();
            asphalt.destroy();
            edging.destroy();
            texture.destroy();
        }
    };
}
