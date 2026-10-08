/**
 * 3D 场景：PlayCanvas 应用、光照、环境、相机、尺寸标注与立面模型。
 * 初始化方式与 house-viewer/src/site-definition/start.ts 相同（去掉了场地、景观与产品放置）。
 */
import {
    AppBase,
    AppOptions,
    CameraComponentSystem,
    ContainerHandler,
    FILLMODE_NONE,
    LightComponentSystem,
    RESOLUTION_AUTO,
    RenderComponentSystem,
    TextureHandler,
    createGraphicsDevice
} from 'playcanvas';

import { createCameraController, createOrbitControls } from '../../shared/camera/index.ts';
import type { Bounds3 } from '../../shared/geometry/types.ts';
import { createLifetime } from '../../shared/lifetime.ts';

import { createAnnotations } from './annotations.ts';
import type { Annotation } from './annotations.ts';
import { cameraPresets } from './camera-presets.ts';
import { daylightConfig } from './config.ts';
import { createEnvironment } from './environment.ts';
import { loadFacadeModel } from './facade-model.ts';
import type { FacadeModel, Representation } from './facade-model.ts';
import { createDaylight } from './lighting.ts';

const LABEL_MARGIN_MM = 1200; // 给尺寸标注留出画面空间

export type FacadeScene = Awaited<ReturnType<typeof createScene>>;

export async function createScene(canvas: HTMLCanvasElement, viewport: HTMLElement, labels: HTMLElement) {
    const lifetime = createLifetime();
    const device = await createGraphicsDevice(canvas);
    device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);
    const options = new AppOptions();
    options.graphicsDevice = device;
    options.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem];
    options.resourceHandlers = [TextureHandler, ContainerHandler];
    const app = new AppBase(canvas);
    app.init(options);
    app.setCanvasFillMode(FILLMODE_NONE, viewport.clientWidth, viewport.clientHeight);
    app.setCanvasResolution(RESOLUTION_AUTO);
    lifetime.add(() => app.destroy());

    const environment = createEnvironment(app);
    lifetime.add(() => environment.destroy());
    const daylight = createDaylight(app);
    lifetime.add(() => daylight.destroy());
    const camera = createCameraController(app, cameraPresets, { ...daylightConfig.camera, duration: 0.8, minimumCameraY: 100 });
    lifetime.add(() => camera.destroy());
    const orbit = createOrbitControls(canvas, camera);
    lifetime.add(() => orbit.destroy());
    const annotations = createAnnotations(app, labels);
    lifetime.add(() => annotations.destroy());
    lifetime.add(camera.onMove(() => annotations.refresh(camera.project)));

    let model: FacadeModel | undefined;
    let representation: Representation = 'render';
    let framing: Bounds3 | undefined;
    const size = () => ({ width: viewport.clientWidth, height: viewport.clientHeight });
    const resize = () => {
        const { width, height } = size();
        if (!width || !height) return;
        app.resizeCanvas(width, height);
        if (framing) camera.fit(framing, { width, height });
        annotations.refresh(camera.project);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    lifetime.add(() => observer.disconnect());
    app.start();
    resize();

    return {
        /** 加载新版本；成功后才替换旧模型。 */
        async showBuild(buildUrl: string, items: Annotation[]) {
            const next = await loadFacadeModel(app, buildUrl, lifetime.signal);
            next.setRepresentation(representation);
            app.root.addChild(next.entity);
            model?.destroy();
            model = next;
            environment.updateBounds(next.bounds);
            daylight.updateBounds(next.bounds);
            framing = expand(next.bounds, LABEL_MARGIN_MM);
            camera.fit(framing, size(), true);
            annotations.set(items);
            annotations.refresh(camera.project);
        },
        setRepresentation(mode: Representation) {
            representation = mode;
            model?.setRepresentation(mode);
        },
        setOpeningDimensionsVisible(value: boolean) {
            annotations.setOpeningsVisible(value);
            annotations.refresh(camera.project);
        },
        setView(id: string) {
            camera.setView(id);
            annotations.refresh(camera.project);
        },
        destroy() {
            model?.destroy();
            lifetime.dispose();
        }
    };
}

function expand(bounds: Bounds3, margin: number): Bounds3 {
    return {
        min: { x: bounds.min.x - margin, y: bounds.min.y, z: bounds.min.z },
        max: { x: bounds.max.x + margin, y: bounds.max.y + margin / 3, z: bounds.max.z + margin }
    };
}
