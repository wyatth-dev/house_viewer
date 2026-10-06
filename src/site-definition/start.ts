import {
    AppBase,
    AppOptions,
    CameraComponentSystem,
    ContainerHandler,
    FILLMODE_NONE,
    RESOLUTION_AUTO,
    LightComponentSystem,
    RenderComponentSystem,
    TextureHandler,
    createGraphicsDevice
} from 'playcanvas';

import { createPlacementController } from '../product-placement/controller.ts';
import { loadHouse } from '../scene/house/house.ts';
import { createModelPreview } from '../scene/model-preview/index.ts';
import { createCameraController, createCameraControls, createOrbitControls } from '../shared/camera/index.ts';
import { createLifetime } from '../shared/lifetime.ts';

import { cameraPresets } from './camera-presets.ts';
import { createSiteController, createSiteControls } from './index.ts';
import { createPanel } from './panel.ts';
import { createRendering, daylightConfig } from './rendering/index.ts';
import { createSceneCoordinator } from './scene-controller.ts';
import './style.css';

export function startSiteDefinition() {
    const canvas = document.querySelector<HTMLCanvasElement>('#application-canvas')!;
    const viewport = document.querySelector<HTMLElement>('#viewport')!;
    const status = document.querySelector<HTMLElement>('#status')!;
    const panel = createPanel(document.querySelector<HTMLElement>('#panel')!);
    const lifetime = createLifetime();
    lifetime.add(() => panel.destroy());
    const renderModes = document.createElement('div');
    renderModes.className = 'render-mode-controls';
    renderModes.setAttribute('role', 'group');
    renderModes.setAttribute('aria-label', 'Scene rendering modes');
    for (const [id, label] of [['watercolor', 'Watercolor'], ['white', 'White model'], ['full', 'Full render']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `render-mode-swatch ${id}`;
        button.title = `${label} — not connected yet`;
        button.setAttribute('aria-label', label!);
        button.setAttribute('aria-disabled', 'true');
        renderModes.append(button);
    }
    const hedgeToggle = document.createElement('button');
    hedgeToggle.type = 'button';
    hedgeToggle.className = 'hedge-toggle';
    hedgeToggle.textContent = 'Fence · Off';
    hedgeToggle.setAttribute('aria-label', 'Toggle fence');
    hedgeToggle.setAttribute('aria-pressed', 'false');
    viewport.append(hedgeToggle);
    lifetime.add(() => hedgeToggle.remove());
    viewport.append(renderModes);
    lifetime.add(() => renderModes.remove());
    const isDisposed = () => lifetime.signal.aborted;
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

        // Scene assets: House and the temporary product preview
        const house = await loadHouse(app, lifetime.signal);
        lifetime.add(house.destroy);
        lifetime.signal.throwIfAborted();

        // Scene services: rendering, camera and site
        const rendering = createRendering(app);
        let hedgeVisible = false;
        hedgeToggle.onclick = () => {
            hedgeVisible = !hedgeVisible;
            rendering.setHedgeVisible(hedgeVisible);
            hedgeToggle.setAttribute('aria-pressed', String(hedgeVisible));
            hedgeToggle.textContent = hedgeVisible ? 'Fence · On' : 'Fence · Off';
        };
        lifetime.add(() => { hedgeToggle.onclick = null; });
        const whiteMode = renderModes.querySelector<HTMLButtonElement>('.white')!;
        const grassMode = renderModes.querySelector<HTMLButtonElement>('.watercolor')!;
        let selectedColorMode: boolean | undefined;
        const selectGrassMode = (enabled: boolean) => {
            if (selectedColorMode === enabled) return;
            selectedColorMode = enabled;
            whiteMode.setAttribute('aria-pressed', String(!enabled));
            grassMode.setAttribute('aria-pressed', String(enabled));
            rendering.setGrassVisible(enabled);
        };
        for (const [button, label] of [[whiteMode, 'White model'], [grassMode, 'Site grass and grouped trees']] as const) {
            button.removeAttribute('aria-disabled');
            button.setAttribute('aria-label', label);
            button.title = label;
        }
        whiteMode.onclick = () => selectGrassMode(false);
        grassMode.onclick = () => selectGrassMode(true);
        selectGrassMode(true);
        lifetime.add(() => { whiteMode.onclick = null; grassMode.onclick = null; });
        lifetime.add(() => rendering.destroy());
        const camera = createCameraController(app, cameraPresets, {
            ...daylightConfig.camera,
            duration: 0.8,
            minimumCameraY: 100
        });
        lifetime.add(() => camera.destroy());
        const orbitControls = createOrbitControls(canvas, camera);
        lifetime.add(() => orbitControls.destroy());
        const site = createSiteController(app, house.footprint, document.querySelector<HTMLElement>('#measurements')!);
        lifetime.add(() => site.destroy());

        let contextVisible = true;
        const updateHouseVisibility = () => {
            const activeCamera = app.root.findComponents('camera').find((component) => component.entity.enabled);
            const position = activeCamera?.entity.getPosition();
            const { min, max } = house.bounds;
            const inside =
                position &&
                position.x >= min.x &&
                position.x <= max.x &&
                position.y >= min.y &&
                position.y <= max.y &&
                position.z >= min.z &&
                position.z <= max.z;
            house.entity.enabled = contextVisible && !inside;
        };
        lifetime.add(camera.onMove(updateHouseVisibility));

        const productChoice = document.querySelector<HTMLButtonElement>('#select-varenda')!;
        const placement = createPlacementController(
            app,
            document.querySelector<HTMLElement>('#measurements')!,
            () => site.getLayout().property,
            camera.project,
            viewport,
            productChoice,
            camera.screenToGround,
            lifetime.signal,
            (bounds, basis) => {
                const size = { width: viewport.clientWidth, height: viewport.clientHeight };
                if (bounds) camera.fit(bounds, size, true, basis);
                else coordinator.resize(size, true);
            },
            (visible) => {
                contextVisible = visible;
                updateHouseVisibility();
                site.setVisible(visible);
                rendering.setContextVisible(visible);
            }
        );
        lifetime.add(() => placement.destroy());

        const selectProduct = () => placement.toggleProduct('varenda');
        productChoice.addEventListener('click', selectProduct);
        lifetime.add(() => productChoice.removeEventListener('click', selectProduct));

        lifetime.add(camera.onMove(placement.refreshLabels));
        lifetime.add(
            panel.onStepChange((step) => {
                placement.setPlacementActive(step === 'placement');
                site.setMeasurementsVisible(step === 'site');
                coordinator.resize({ width: viewport.clientWidth, height: viewport.clientHeight }, true);
                site.refreshLabels(camera.project);
                document.title =
                    step === 'placement'
                        ? 'House & Ground — Product placement'
                        : 'House & Ground — Define your property';
            })
        );

        const updateSiteContext = () => {
            rendering.updateLayout(site.getLayout());
            const bounds = site.getBounds();
            rendering.updateBounds({
                min: { ...bounds.min },
                max: { ...bounds.max, y: house.bounds.max.y }
            });
        };
        updateSiteContext();

        // Coordination: scene bounds and camera policy stay outside product rendering.
        const coordinator = createSceneCoordinator(site, camera, house.bounds, () => site.getBounds());
        lifetime.add(camera.onMove(coordinator.refresh));
        // Controls: site dimensions and camera presets
        const dimensionControls = createSiteControls(
            panel.dimensions,
            panel.summary,
            site.getState().dimensions,
            (value) => {
                const errors = coordinator.setDimensions(value);
                if (!Object.keys(errors).length) {
                    dimensionControls.update(site.getLayout());
                    updateSiteContext();
                    placement.refresh();
                }
                return errors;
            }
        );
        lifetime.add(() => dimensionControls.destroy());
        site.setDimensionEditor((side, valueMm) => {
            const candidate = { ...site.getState().dimensions, [side]: valueMm };
            const errors = coordinator.setDimensions(candidate);
            if (Object.keys(errors).length) return errors[side] ?? 'Invalid site dimensions.';
            dimensionControls.syncDimensions(candidate);
            dimensionControls.update(site.getLayout());
            updateSiteContext();
            placement.refresh();
            return undefined;
        });
        const viewControls = createCameraControls(panel.views, cameraPresets, (id) => {
            coordinator.setView(id);
            const preset = cameraPresets.find((candidate) => candidate.id === id)!;
            document.querySelector('#projection-label')!.textContent =
                preset.projection === 'perspective' ? 'Perspective' : 'Orthographic';
            viewControls.update(id);
            document.querySelector('#active-view')!.textContent = `${preset.label} view`;
        });
        lifetime.add(() => viewControls.destroy());
        // Viewport lifecycle
        const resize = () => {
            const width = viewport.clientWidth;
            const height = viewport.clientHeight;
            if (!width || !height) return;

            app.resizeCanvas(width, height);
            coordinator.resize({ width, height });
            const detailBounds = placement.focusBounds();
            if (detailBounds) camera.fit(detailBounds, { width, height }, false, placement.focusBasis());
            placement.refreshLabels();
        };

        const observer = new ResizeObserver(resize);
        observer.observe(viewport);
        lifetime.add(() => observer.disconnect());
        dimensionControls.update(site.getLayout());
        viewControls.update(camera.getState().activePresetId);
        resize();
        // Thumbnail: independent from the interactive scene camera
        const preview = createModelPreview(app, house.entity, house.bounds);
        lifetime.add(() => preview.destroy());
        void preview.ready
            .then((url) => {
                if (!isDisposed() && url) panel.showModelPreview(url);
            })
            .catch((error) => {
                if (!isDisposed()) {
                    console.warn('Model preview could not be generated', error);
                    panel.previewFailed();
                }
            });
        // Startup
        app.start();
        panel.enable();
        status.hidden = true;
        requestAnimationFrame(() => {
            if (!isDisposed()) coordinator.refresh();
        });
    }
    void start().catch((error) => {
        if (isDisposed()) return;
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
            lifetime.dispose();
        });
}
