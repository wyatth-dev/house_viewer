import type { ContainerResource } from 'playcanvas';
import {
    AppBase,
    AppOptions,
    CameraComponentSystem,
    ContainerHandler,
    LightComponentSystem,
    RenderComponentSystem,
    TextureHandler,
    Entity,
    Color,
    createGraphicsDevice
} from 'playcanvas';

import { createLifetime } from '../app/lifetime.ts';
import { fitPerspective } from '../camera/framing.ts';
import { loadContainer } from '../house/asset-loader.ts';
import { varendaDatums } from '../parametric-engine/varenda/datums.ts';
import { defaultVarendaParams } from '../parametric-engine/varenda/parameters.ts';
import { solveColumnLayout, solveFootings } from '../parametric-engine/varenda/varenda-solver.ts';
import { loadFootplatePreview } from '../product-view/footplate-preview.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#lab-canvas')!;
const status = document.querySelector<HTMLElement>('#lab-status')!;
const lifetime = createLifetime();

canvas.style.display = 'block';
canvas.style.width = '100%';
canvas.style.height = '70vh';

async function start() {
    const device = await createGraphicsDevice(canvas);

    if (lifetime.signal.aborted) {
        device.destroy();
        return;
    }

    const options = new AppOptions();
    options.graphicsDevice = device;
    options.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem];
    options.resourceHandlers = [TextureHandler, ContainerHandler];

    const app = new AppBase(canvas);
    app.init(options);
    lifetime.add(() => app.destroy());

    const camera = new Entity('Lab camera');
    camera.addComponent('camera', {
        clearColor: new Color(0.9, 0.92, 0.94),
        nearClip: 1,
        farClip: 10000
    });
    app.root.addChild(camera);

    // 毫米坐标：观察原点附近的柱脚。
    camera.setPosition(350, 300, 400);
    camera.lookAt(0, 40, 0);

    const light = new Entity('Lab light');
    light.addComponent('light', {
        type: 'directional',
        intensity: 1.5
    });
    light.setEulerAngles(45, 30, 0);
    app.root.addChild(light);
    app.scene.ambientLight = new Color(0.35, 0.35, 0.35);

    const footplate = await loadFootplatePreview(app, lifetime.signal);
    lifetime.add(() => footplate.destroy());
    lifetime.signal.throwIfAborted();

    // footplate.entity.setPosition(0, 0, 0);
    const params = { ...defaultVarendaParams };

    let instances: Entity[] = [];

    const updateFootplates = (nextWidthMm: number, nextDepthMm: number, intervalMm: number) => {
        const nextParams = {
            ...params,
            widthMm: nextWidthMm,
            depthMm: nextDepthMm,
            postInterval: intervalMm
        };
        const columnLayout = solveColumnLayout(nextParams);
        const result = solveFootings(columnLayout, varendaDatums);

        for (const entity of instances.slice(1)) {
            entity.destroy();
        }

        instances = result.assemblies.map((assembly, index) => {
            const entity = index === 0 ? footplate.entity : footplate.entity.clone();

            if (index !== 0) app.root.addChild(entity);

            entity.name = assembly.assemblyId;
            const p = assembly.positionMm;
            // Renderer-only axis mapping and presentation centering.
            entity.setPosition(p.x - nextParams.widthMm / 2, p.z, -p.y);

            return entity;
        });

        Object.assign(params, nextParams);
        status.textContent =
            `Footing assemblies: ${result.assemblies.length} · ` +
            `Local X: ${result.centresMm.join(', ')} mm · ` +
            `Outward depth: ${nextDepthMm} mm`;
    };

    lifetime.add(() => {
        for (const entity of instances.slice(1)) {
            entity.destroy();
        }
    });

    const widthInput = document.querySelector<HTMLInputElement>('#product-width')!;

    const intervalInput = document.querySelector<HTMLInputElement>('#post-interval')!;

    const depthInput = document.querySelector<HTMLInputElement>('#product-depth')!;

    widthInput.value = String(params.widthMm);
    intervalInput.value = String(params.postInterval);
    depthInput.value = String(params.depthMm);

    const onParametersInput = () => {
        try {
            updateFootplates(widthInput.valueAsNumber, depthInput.valueAsNumber, intervalInput.valueAsNumber);
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : 'Invalid input';
        }
    };

    for (const input of [widthInput, intervalInput, depthInput]) {
        input.addEventListener('input', onParametersInput);
        lifetime.add(() => {
            input.removeEventListener('input', onParametersInput);
        });
    }

    updateFootplates(params.widthMm, params.depthMm, params.postInterval);

    // import post
    const postAsset = await loadContainer(app.assets, '/models/varenda/post-body.glb', lifetime.signal);

    lifetime.add(() => {
        postAsset.unload();
        app.assets.remove(postAsset);
    });

    lifetime.signal.throwIfAborted();

    const postBody = (postAsset.resource as ContainerResource).instantiateRenderEntity();

    app.root.addChild(postBody);
    lifetime.add(() => postBody.destroy());

    // 暂时放在整排中央，底端落在厚 5 mm 的底板上。
    postBody.setPosition(0, varendaDatums.postBaseZMm, params.depthMm);

    // Camera
    const resize = () => {
        if (lifetime.signal.aborted) return;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;

        app.resizeCanvas(width, height);

        const frame = fitPerspective(
            {
                min: {
                    x: -params.widthMm / 2 - 100,
                    y: 0,
                    z: params.depthMm - 100
                },
                max: {
                    x: params.widthMm / 2 + 100,
                    y: 100,
                    z: params.depthMm + 100
                }
            },
            { width, height },
            { x: 0.2, y: 0.7, z: 1 },
            45
        );

        camera.setPosition(frame.position.x, frame.position.y, frame.position.z);

        camera.lookAt(frame.center.x, frame.center.y, frame.center.z);

        camera.camera!.nearClip = frame.near;
        camera.camera!.farClip = frame.far;
    };

    const fitButton = document.querySelector<HTMLButtonElement>('#fit-product')!;

    fitButton.addEventListener('click', resize);

    lifetime.add(() => {
        fitButton.removeEventListener('click', resize);
    });

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    lifetime.add(() => observer.disconnect());

    resize();
    app.start();
}

void start().catch((error: unknown) => {
    if (lifetime.signal.aborted) return;

    lifetime.dispose();
    console.error(error);
    status.textContent = error instanceof Error ? error.message : 'Lab initialization failed';
});

if (import.meta.hot) {
    import.meta.hot.dispose(() => lifetime.dispose());
}
