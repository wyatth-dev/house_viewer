import {
    Color,
    Entity,
    EnvLighting,
    PIXELFORMAT_RGBA8,
    StandardMaterial,
    TEXTUREPROJECTION_EQUIRECT,
    Texture
} from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { Bounds3 } from '../../shared/geometry/types.ts';

import { daylightConfig, whiteModelPalette } from './config.ts';

/** A local procedural daylight environment: no network assets or extra render loop. */
export function createEnvironment(app: AppBase) {
    const previous = { skybox: app.scene.skybox, atlas: app.scene.envAtlas, ambient: app.scene.ambientLight.clone() };
    const width = 256,
        height = 128;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        const altitude = Math.cos((Math.PI * (y + 0.5)) / height);
        for (let x = 0; x < width; x++) {
            const t = Math.pow(Math.abs(altitude), 0.6);
            const horizon = [235, 238, 241];
            const pole = altitude > 0 ? [210, 220, 230] : [210, 213, 216];
            const i = (y * width + x) * 4;
            for (let c = 0; c < 3; c++) data[i + c] = horizon[c] * (1 - t) + pole[c] * t;
            data[i + 3] = 255;
        }
    }
    const source = new Texture(app.graphicsDevice, {
        name: 'Daylight panorama',
        width,
        height,
        format: PIXELFORMAT_RGBA8,
        projection: TEXTUREPROJECTION_EQUIRECT,
        mipmaps: false,
        levels: [data]
    });
    const sky = EnvLighting.generateSkyboxCubemap(source, 64);
    const lighting = EnvLighting.generateLightingSource(source, { size: 64 });
    const atlas = EnvLighting.generateAtlas(lighting, { numReflectionSamples: 64, numAmbientSamples: 64 });
    source.destroy();
    lighting.destroy();
    app.scene.skybox = null;
    app.scene.envAtlas = atlas;
    app.scene.ambientLight = new Color(0.32, 0.34, 0.36);

    const material = new StandardMaterial();
    material.name = 'WhiteModel_Environment_Ground';
    material.diffuse = new Color().fromString(whiteModelPalette.ground);
    material.gloss = 0;
    material.update();
    const ground = new Entity('Environment ground');
    ground.addComponent('render', { type: 'plane', material, castShadows: false, receiveShadows: true });
    ground.setLocalScale(daylightConfig.groundSize, 1, daylightConfig.groundSize);
    app.root.addChild(ground);
    return {
        setVisible(value: boolean) {
            ground.enabled = value;
            app.scene.skybox = null;
        },
        updateBounds(bounds: Bounds3) {
            ground.setPosition(
                (bounds.min.x + bounds.max.x) / 2,
                daylightConfig.groundY,
                (bounds.min.z + bounds.max.z) / 2
            );
        },
        destroy() {
            ground.destroy();
            material.destroy();
            app.scene.skybox = previous.skybox;
            app.scene.envAtlas = previous.atlas;
            app.scene.ambientLight = previous.ambient;
            atlas.destroy();
            sky.destroy();
        }
    };
}
