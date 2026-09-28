import {
    AppBase,
    AppOptions,
    CameraComponentSystem,
    Color,
    ContainerHandler,
    Entity,
    FILLMODE_NONE,
    RESOLUTION_AUTO,
    LightComponentSystem,
    RenderComponentSystem,
    TextureHandler,
    createGraphicsDevice
} from 'playcanvas';

import { cameraPresets } from './app/camera-presets.ts';
import { createLifetime } from './app/lifetime.ts';
import { createSceneCoordinator } from './app/scene-controller.ts';
import { createCameraController, createCameraControls } from './camera/index.ts';
import { loadHouse } from './house/house.ts';
import { createModelPreview } from './model-preview/index.ts';
import { createSiteController, createSiteControls } from './site-definition/index.ts';
import { createPanel } from './ui/panel.ts';
import './style.css';
const canvas = document.querySelector<HTMLCanvasElement>('#application-canvas')!;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const status = document.querySelector<HTMLElement>('#status')!;
const panel = createPanel(document.querySelector<HTMLElement>('#panel')!);
const lifetime = createLifetime();
let disposed = false;
async function start() {
    const device = await createGraphicsDevice(canvas);
    if (lifetime.signal.aborted) {
        device.destroy();
        return;
    }
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
    if (disposed) {
        app.destroy();
        return;
    }
    app.scene.ambientLight = new Color(0.65, 0.65, 0.65);
    const light = new Entity('Daylight');
    light.addComponent('light', { type: 'directional', intensity: 1.25 });
    light.setEulerAngles(50, -30, 0);
    app.root.addChild(light);
    const house = await loadHouse(app, lifetime.signal);
    lifetime.add(house.destroy);
    if (disposed) {
        house.destroy();
        return;
    }
    const camera = createCameraController(app, cameraPresets, {
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.8
    });
    lifetime.add(() => camera.destroy());
    const site = createSiteController(app, house.footprint, document.querySelector<HTMLElement>('#measurements')!);
    lifetime.add(() => site.destroy());
    const coordinator = createSceneCoordinator(site, camera, house.bounds);
    lifetime.add(camera.onMove(coordinator.refresh));
    const dimensionControls = createSiteControls(
        panel.dimensions,
        panel.summary,
        site.getState().dimensions,
        (value) => {
            const errors = coordinator.setDimensions(value);
            if (!Object.keys(errors).length) dimensionControls.update(site.getLayout());
            return errors;
        }
    );
    lifetime.add(() => dimensionControls.destroy());
    const viewControls = createCameraControls(panel.views, cameraPresets, (id) => {
        coordinator.setView(id);
        document.querySelector('#projection-label')!.textContent =
            cameraPresets.find((p) => p.id === id)!.projection === 'perspective' ? 'Perspective' : 'Orthographic';
        viewControls.update(id);
        document.querySelector('#active-view')!.textContent = `${cameraPresets.find((p) => p.id === id)!.label} view`;
    });
    lifetime.add(() => viewControls.destroy());
    const resize = () => {
        const width = viewport.clientWidth,
            height = viewport.clientHeight;
        if (!width || !height) return;
        app.resizeCanvas(width, height);
        coordinator.resize({ width, height });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    lifetime.add(() => observer.disconnect());
    dimensionControls.update(site.getLayout());
    viewControls.update(camera.getState().activePresetId);
    resize();
    const preview = createModelPreview(app, house.entity, house.bounds);
    lifetime.add(() => preview.destroy());
    void preview.ready
        .then((url) => {
            if (!disposed && url) panel.showModelPreview(url);
        })
        .catch((error) => {
            if (!disposed) {
                console.warn('Model preview could not be generated', error);
                panel.previewFailed();
            }
        });
    app.start();
    panel.enable();
    status.hidden = true;
    requestAnimationFrame(() => {
        if (!disposed) coordinator.refresh();
    });
}
void start().catch((error) => {
    if (disposed) return;
    lifetime.dispose();
    console.error(error);
    status.classList.add('error');
    status.replaceChildren();
    const message = document.createElement('p');
    message.textContent = error instanceof Error ? error.message : 'The scene could not start.';
    const button = document.createElement('button');
    button.textContent = 'Reload scene';
    button.onclick = () => location.reload();
    status.append(message, button);
});
if (import.meta.hot)
    import.meta.hot.dispose(() => {
        disposed = true;
        lifetime.dispose();
        panel.destroy();
    });
