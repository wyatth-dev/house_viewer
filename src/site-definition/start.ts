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
import { fadeHouseModel } from '../scene/house/fade.ts';
import type { HouseRepresentation } from '../scene/house/house-config.ts';
import { loadHouse } from '../scene/house/house.ts';
import { houseRepresentationIcon } from '../scene/house/representation-icon.ts';
import { createModelPreview } from '../scene/model-preview/index.ts';
import { loadTypology, storePreview, typologyUrl } from '../scenes/typology/catalog.ts';
import type { TypologyEntry } from '../scenes/typology/catalog.ts';
import { activeTypology, setActiveTypology } from '../scenes/typology/index.ts';
import { createCameraController, createCameraControls, createOrbitControls } from '../shared/camera/index.ts';
import { createLifetime } from '../shared/lifetime.ts';

import { cameraPresets } from './camera-presets.ts';
import { createSiteController, createSiteControls } from './index.ts';
import { createPanel } from './panel.ts';
import { createRendering, daylightConfig } from './rendering/index.ts';
import { createSceneCoordinator } from './scene-controller.ts';
import './style.css';

/** `initial` is the typology already made active by main.ts. */
export function startSiteDefinition(initial: TypologyEntry) {
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
    const modeButtons = new Map<HouseRepresentation, HTMLButtonElement>();
    const modes: [HouseRepresentation, string][] = [
        ['white', 'White model'], ['color-block', 'Color blocks'], ['render', 'Detailed render']
    ];
    for (const [id, label] of modes) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `render-mode-swatch ${id}`;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(id === 'render'));
        button.innerHTML = houseRepresentationIcon(id);
        button.disabled = true;
        modeButtons.set(id, button);
        renderModes.append(button);
    }
    const hedgeToggle = document.createElement('button');
    hedgeToggle.type = 'button';
    hedgeToggle.className = 'hedge-toggle';
    hedgeToggle.textContent = 'Fence · Off';
    hedgeToggle.setAttribute('aria-label', 'Toggle fence');
    hedgeToggle.setAttribute('aria-pressed', 'false');
    const treeToggle = document.createElement('button');
    treeToggle.type = 'button';
    treeToggle.className = 'hedge-toggle';
    treeToggle.textContent = 'Trees · On';
    treeToggle.setAttribute('aria-label', 'Toggle trees');
    treeToggle.setAttribute('aria-pressed', 'true');
    const landscapeControls = document.createElement('div');
    landscapeControls.className = 'landscape-controls';
    landscapeControls.setAttribute('role', 'group');
    landscapeControls.setAttribute('aria-label', 'Landscape visibility');
    landscapeControls.append(hedgeToggle, treeToggle);
    viewport.append(landscapeControls);
    lifetime.add(() => landscapeControls.remove());
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
        let house = await loadHouse(app, lifetime.signal);
        lifetime.add(() => house.destroy());
        lifetime.signal.throwIfAborted();
        await house.setRepresentation('render');
        lifetime.signal.throwIfAborted();
        let currentMode: HouseRepresentation = 'render';
        let modeChanges = Promise.resolve();
        const setSceneMode = (mode: HouseRepresentation) => {
            currentMode = mode;
            modeChanges = modeChanges.catch(() => {}).then(async () => {
                if (isDisposed()) return;
                await house.setRepresentation(mode, true);
                if (isDisposed()) return;
                rendering.setGrassVisible(mode !== 'white');
                for (const [id, candidate] of modeButtons)
                    candidate.setAttribute('aria-pressed', String(id === mode));
            });
            return modeChanges;
        };
        for (const [mode, button] of modeButtons) {
            button.disabled = false;
            button.onclick = async () => {
                renderModes.setAttribute('aria-busy', 'true');
                for (const candidate of modeButtons.values()) candidate.disabled = true;
                try {
                    await setSceneMode(mode);
                    if (isDisposed()) return;
                    for (const [id, candidate] of modeButtons)
                        candidate.setAttribute('aria-pressed', String(id === mode));
                    status.hidden = true;
                } catch (error) {
                    if (!isDisposed()) {
                        console.error(error);
                        status.textContent = 'Could not switch rendering mode. Please try again.';
                        status.hidden = false;
                    }
                } finally {
                    if (!isDisposed()) {
                        renderModes.setAttribute('aria-busy', 'false');
                        for (const candidate of modeButtons.values()) candidate.disabled = false;
                    }
                }
            };
            lifetime.add(() => { button.onclick = null; });
        }

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
        let treesVisible = true;
        treeToggle.onclick = () => {
            treesVisible = !treesVisible;
            rendering.setTreesVisible(treesVisible);
            treeToggle.setAttribute('aria-pressed', String(treesVisible));
            treeToggle.textContent = treesVisible ? 'Trees · On' : 'Trees · Off';
        };
        lifetime.add(() => { treeToggle.onclick = null; });
        let editSnapshot: { mode: HouseRepresentation; trees: boolean; fence: boolean } | undefined;
        const setLandscape = (trees: boolean, fence: boolean) => {
            treesVisible = trees;
            hedgeVisible = fence;
            rendering.setTreesVisible(trees);
            rendering.setHedgeVisible(fence);
            treeToggle.setAttribute('aria-pressed', String(trees));
            treeToggle.textContent = trees ? 'Trees · On' : 'Trees · Off';
            hedgeToggle.setAttribute('aria-pressed', String(fence));
            hedgeToggle.textContent = fence ? 'Fence · On' : 'Fence · Off';
        };
        const editModeChanged = (editing: boolean) => {
            if (editing) {
                if (editSnapshot) return;
                editSnapshot = { mode: currentMode, trees: treesVisible, fence: hedgeVisible };
                setLandscape(false, false);
                void setSceneMode('white').catch(error => console.error(error));
            } else if (editSnapshot) {
                const previous = editSnapshot;
                editSnapshot = undefined;
                setLandscape(previous.trees, previous.fence);
                void setSceneMode(previous.mode).catch(error => console.error(error));
            }
        };
        rendering.setGrassVisible(true);
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
        const createPlacement = () => createPlacementController(
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
            },
            editModeChanged
        );
        // Recreated when the typology changes: placed products belong to the previous house's walls.
        let placement = createPlacement();
        lifetime.add(() => placement.destroy());

        const selectProduct = () => placement.toggleProduct('varenda');
        productChoice.addEventListener('click', selectProduct);
        lifetime.add(() => productChoice.removeEventListener('click', selectProduct));

        lifetime.add(camera.onMove(() => placement.refreshLabels()));
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
        const coordinator = createSceneCoordinator(site, camera, () => house.bounds, () => site.getBounds());
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
        // Thumbnail: independent from the interactive scene camera. Photo typologies are seen
        // from their modelled facade (often the back), presets from the front.
        let preview: ReturnType<typeof createModelPreview> | undefined;
        lifetime.add(() => preview?.destroy());
        const renderPreview = (entry: TypologyEntry) => {
            const typology = activeTypology();
            const outward = typology.source === 'photo' ? (typology.installationFaces[0]?.outwardUnit.z ?? 1) : 1;
            preview?.destroy();
            const current = createModelPreview(app, house.entity, house.bounds, {
                direction: { x: outward, y: 1, z: outward }
            });
            preview = current;
            void current.ready
                .then(async (url) => {
                    if (isDisposed() || !url) return;
                    if (!entry.previewUrl) void panel.setTypologyPreview(entry.id, url);
                    await storePreview(entry, current.blob());
                })
                .catch((error) => console.warn('Model preview could not be generated', error));
        };
        panel.setActiveTypology(initial.id);
        renderPreview(initial);

        // Typology switch: replace only the house and what depends on it (yard envelope,
        // installation walls, placed products). App, camera, lighting, landscape and yard
        // dimensions are kept.
        let switching = Promise.resolve();
        const switchTypology = (entry: TypologyEntry, pushHistory = true) => {
            switching = switching.then(async () => {
                if (isDisposed() || entry.id === activeTypology().id) return;
                panel.setTypologyBusy(true);
                panel.setActiveTypology(entry.id);
                status.textContent = `Loading ${entry.name}…`;
                status.hidden = false;
                const previous = activeTypology();
                try {
                    const { typology } = await loadTypology(entry.id);
                    setActiveTypology(typology);
                    const next = await loadHouse(app, lifetime.signal);
                    next.entity.enabled = false; // hidden until its representation is ready
                    try {
                        if (currentMode !== 'white') await next.setRepresentation(currentMode);
                    } catch (error) {
                        next.destroy();
                        throw error;
                    }
                    if (isDisposed()) {
                        next.destroy();
                        return;
                    }
                    // Same fade as representation changes: old house out, new house in.
                    const fade = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    const old = house;
                    if (fade) await fadeHouseModel(app, old.entity, 1, 0, lifetime.signal);
                    house = next;
                    old.destroy();
                    placement.destroy();
                    placement = createPlacement();
                    placement.setPlacementActive(false);
                    site.setFootprint(house.footprint);
                    dimensionControls.update(site.getLayout());
                    updateSiteContext();
                    updateHouseVisibility();
                    coordinator.resize({ width: viewport.clientWidth, height: viewport.clientHeight }, true);
                    if (fade && house.entity.enabled) await fadeHouseModel(app, house.entity, 0, 1, lifetime.signal);
                    renderPreview(entry);
                    if (pushHistory) window.history.pushState({ typology: entry.id }, '', typologyUrl(entry.id));
                    status.hidden = true;
                } catch (error) {
                    if (isDisposed()) return;
                    console.error(error);
                    setActiveTypology(previous);
                    panel.setActiveTypology(previous.id);
                    status.textContent = `Could not load ${entry.name}. ${(error as Error).message}`;
                } finally {
                    panel.setTypologyBusy(false);
                }
            });
            return switching;
        };
        lifetime.add(panel.onSelectTypology((entry) => void switchTypology(entry)));
        const onHistory = () => {
            const id = new URLSearchParams(window.location.search).get('typology') ?? initial.id;
            void loadTypology(id)
                .then(({ entry }) => switchTypology(entry, false))
                .catch((error) => console.error(error));
        };
        window.addEventListener('popstate', onHistory);
        lifetime.add(() => window.removeEventListener('popstate', onHistory));
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
