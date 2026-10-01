import {
    AppBase,
    AppOptions,
    CameraComponentSystem,
    ContainerHandler,
    LightComponentSystem,
    RenderComponentSystem,
    TextureHandler,
    Entity,
    Color
} from 'playcanvas';
import { createGraphicsDevice } from 'playcanvas';

import { createLifetime } from '../app/lifetime.ts';
import { loadFootplatePreview } from '../product-view/footplate-preview.ts';

import { layoutPosts } from '../parametric-engine/varenda/layout-posts.ts';
import { fitPerspective } from '../camera/framing.ts';
import { defaultVarendaParams } from '../parametric-engine/varenda/parameters.ts';

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
    options.componentSystems = [
        RenderComponentSystem,
        CameraComponentSystem,
        LightComponentSystem
    ];
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

    const widthMm = params.widthMm;
    const depthMm = params.depthMm;
    
    let instances: Entity[] = [];

    const updateFootplates = (intervalMm: number) => {
        
        const centers = layoutPosts(widthMm, intervalMm);

        for (const entity of instances.slice(1)) { entity.destroy(); }

        instances = centers.map((x, index) => {
            const entity = 
                index === 0 
                    ? footplate.entity
                    : footplate.entity.clone();
            
            if (index !== 0) app.root.addChild(entity);

            entity.name = `Footplate ${index + 1}`;
            entity.setPosition(x - widthMm / 2, 0, depthMm);

            return entity;
        })

        params.postInterval = intervalMm;
        status.textContent =
            `Post number: ${centers.length} · ` +
            `Local X: ${centers.join(', ')} mm · ` +
            `Outward depth: ${depthMm} mm`;
    }

    lifetime.add(() => {
        for (const entity of instances.slice(1)) { entity.destroy(); }  
    })

    const intervalInput = document.querySelector<HTMLInputElement>('#post-interval')!;

    intervalInput.value = String(params.postInterval);
    
    const onIntervalInput = () => {
        try {
            updateFootplates(intervalInput.valueAsNumber);
        } catch (error) {
            status.textContent = 
                error instanceof Error ? error.message : 'Invalid input';
        }
    };

    intervalInput.addEventListener('input', onIntervalInput);
    lifetime.add(() => intervalInput.removeEventListener('input', onIntervalInput));

    updateFootplates(params.postInterval);

    // Camera
    const resize = () => {
        if (lifetime.signal.aborted) return;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;

        app.resizeCanvas(width, height);

        const frame = fitPerspective(
            {
                min: { x: -widthMm / 2 - 100, y: 0, z: depthMm - 100 },
                max: { x: widthMm / 2 + 100, y: 100, z: depthMm + 100 }
            },
            { width, height },
            { x: 0.2, y: 0.7, z: 1 },
            45
        );

        camera.setPosition(
            frame.position.x,
            frame.position.y,
            frame.position.z
        );

        camera.lookAt(
            frame.center.x,
            frame.center.y,
            frame.center.z
        );

        camera.camera!.nearClip = frame.near;
        camera.camera!.farClip = frame.far;
    };

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
    status.textContent =
        error instanceof Error ? error.message : 'Lab initialization failed';
});

if (import.meta.hot) {
    import.meta.hot.dispose(() => lifetime.dispose());
}