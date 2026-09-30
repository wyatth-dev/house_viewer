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

    footplate.entity.setPosition(0, 0, 0);

    const resize = () => {
        if (lifetime.signal.aborted) return;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;

        app.resizeCanvas(width, height);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    lifetime.add(() => observer.disconnect());

    resize();
    app.start();

    const centres = layoutPosts(8000, 1000);

    status.textContent =
        `柱数量：${centres.length} · 柱中心 X：${centres.join(', ')} mm`;
}

void start().catch((error: unknown) => {
    if (lifetime.signal.aborted) return;

    lifetime.dispose();
    console.error(error);
    status.textContent =
        error instanceof Error ? error.message : '实验场景启动失败';
});

if (import.meta.hot) {
    import.meta.hot.dispose(() => lifetime.dispose());
}