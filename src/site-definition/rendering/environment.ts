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

import { daylightConfig, landscapeConfig } from './config.ts';

/** A local procedural daylight environment: no network assets or extra render loop. */
export function createEnvironment(app: AppBase) {
    const previous = {
        skybox: app.scene.skybox,
        atlas: app.scene.envAtlas,
        ambient: app.scene.ambientLight.clone(),
        intensity: app.scene.skyboxIntensity
    };
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
    app.scene.skyboxIntensity = 0.55;
    app.scene.ambientLight = new Color(0.18, 0.19, 0.2);

    const material = new StandardMaterial();
    material.name = 'WhiteModel_Environment_Ground';
    material.diffuse = new Color().fromString(landscapeConfig.world.color);
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
    let colorProgress = 1;
    let colorTarget = 1;
    const coloredGround = new Color().fromString(landscapeConfig.world.color);
    const animateGround = (dt: number) => {
        colorProgress += Math.sign(colorTarget - colorProgress) * Math.min(Math.abs(colorTarget - colorProgress), dt / 0.4);
        material.diffuse = new Color(1 + (coloredGround.r - 1) * colorProgress,
            1 + (coloredGround.g - 1) * colorProgress, 1 + (coloredGround.b - 1) * colorProgress);
        material.update();
        if (colorProgress === colorTarget) app.off('update', animateGround);
    };
    return {
        setWhiteMode(value: boolean) {
            colorTarget = value ? 0 : 1;
            app.off('update', animateGround);
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) colorProgress = colorTarget;
            animateGround(0);
            if (colorProgress !== colorTarget) app.on('update', animateGround);
        },
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
            app.off('update', animateGround);
            ground.destroy();
            material.destroy();
            app.scene.skybox = previous.skybox;
            app.scene.envAtlas = previous.atlas;
            app.scene.ambientLight = previous.ambient;
            app.scene.skyboxIntensity = previous.intensity;
            atlas.destroy();
            sky.destroy();
        }
    };
}
