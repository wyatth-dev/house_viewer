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

import { daylightConfig } from './config.ts';

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
            const horizon = [220, 227, 232];
            const pole = altitude > 0 ? [164, 188, 211] : [135, 137, 126];
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
    app.scene.skybox = sky;
    app.scene.envAtlas = atlas;
    app.scene.ambientLight = new Color(0.3, 0.34, 0.39);

    const material = new StandardMaterial();
    material.name = 'Quiet meadow surroundings';
    material.diffuse = new Color().fromString('#959884');
    material.gloss = 0;
    // Low-contrast grain keeps the surroundings readable at the large site scale.
    const grain = new Uint8Array(128 * 128 * 4);
    let seed = 42;
    for (let i = 0; i < grain.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const value = 225 + (seed % 30);
        grain[i] = grain[i + 1] = grain[i + 2] = value;
        grain[i + 3] = 255;
    }
    const texture = new Texture(app.graphicsDevice, {
        name: 'Ground grain',
        width: 128,
        height: 128,
        format: PIXELFORMAT_RGBA8,
        levels: [grain]
    });
    material.diffuseMap = texture;
    material.diffuseMapTiling.set(daylightConfig.groundSize / 8000, daylightConfig.groundSize / 8000);
    material.update();
    const ground = new Entity('Environment ground');
    ground.addComponent('render', { type: 'plane', material, castShadows: false, receiveShadows: true });
    ground.setLocalScale(daylightConfig.groundSize, 1, daylightConfig.groundSize);
    app.root.addChild(ground);
    return {
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
            texture.destroy();
            app.scene.skybox = previous.skybox;
            app.scene.envAtlas = previous.atlas;
            app.scene.ambientLight = previous.ambient;
            atlas.destroy();
            sky.destroy();
        }
    };
}
