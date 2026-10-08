/**
 * 程序化天空环境光 + 浅色地面（接收阴影）。
 * 改编自 house-viewer/src/site-definition/rendering/environment.ts：
 * 保留天空全景生成与环境光设置，去掉白模 / 上色模式的地面颜色动画。
 */
import { Color, Entity, EnvLighting, PIXELFORMAT_RGBA8, StandardMaterial, TEXTUREPROJECTION_EQUIRECT, Texture } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { Bounds3 } from '../../shared/geometry/types.ts';

import { daylightConfig } from './config.ts';

function createSkyPanorama(app: AppBase) {
    const width = 256,
        height = 128;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        const altitude = Math.cos((Math.PI * (y + 0.5)) / height);
        const t = Math.pow(Math.abs(altitude), 0.6);
        const horizon = [235, 238, 241];
        const pole = altitude > 0 ? [210, 220, 230] : [210, 213, 216];
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            for (let c = 0; c < 3; c++) data[i + c] = horizon[c] * (1 - t) + pole[c] * t;
            data[i + 3] = 255;
        }
    }
    return new Texture(app.graphicsDevice, {
        name: 'Daylight panorama',
        width,
        height,
        format: PIXELFORMAT_RGBA8,
        projection: TEXTUREPROJECTION_EQUIRECT,
        mipmaps: false,
        levels: [data]
    });
}

export function createEnvironment(app: AppBase) {
    const source = createSkyPanorama(app);
    const lighting = EnvLighting.generateLightingSource(source, { size: 64 });
    const atlas = EnvLighting.generateAtlas(lighting, { numReflectionSamples: 64, numAmbientSamples: 64 });
    source.destroy();
    lighting.destroy();
    app.scene.skybox = null;
    app.scene.envAtlas = atlas;
    app.scene.skyboxIntensity = 0.55;
    app.scene.ambientLight = new Color(0.18, 0.19, 0.2);

    const material = new StandardMaterial();
    material.name = 'Environment ground';
    material.diffuse = new Color().fromString(daylightConfig.worldColor);
    material.useMetalness = false;
    material.specular = new Color(0, 0, 0);
    material.useSkybox = false;
    material.useTonemap = false;
    material.gloss = 0;
    material.update();
    const ground = new Entity('Environment ground');
    ground.addComponent('render', { type: 'plane', material, castShadows: false, receiveShadows: true });
    ground.setLocalScale(daylightConfig.groundSize, 1, daylightConfig.groundSize);
    app.root.addChild(ground);

    return {
        updateBounds(bounds: Bounds3) {
            ground.setPosition((bounds.min.x + bounds.max.x) / 2, daylightConfig.groundY, (bounds.min.z + bounds.max.z) / 2);
        },
        destroy() {
            ground.destroy();
            material.destroy();
            atlas.destroy();
        }
    };
}
