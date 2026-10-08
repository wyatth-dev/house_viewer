import {
    AppBase,
    Entity,
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

import { createPhotoIntake } from '../photo-intake/controller.ts';
import { createPlacementController } from '../product-placement/controller.ts';
import { fadeHouseModel } from '../scene/house/fade.ts';
import type { HouseRepresentation } from '../scene/house/house-config.ts';
import { loadHouse } from '../scene/house/house.ts';
import { houseRepresentationIcon } from '../scene/house/representation-icon.ts';
import { createModelPreview } from '../scene/model-preview/index.ts';
import { createProductAssetStore } from '../shared/assets/containers.ts';
import { createCameraController, createCameraControls, createOrbitControls } from '../shared/camera/index.ts';
import { createLifetime } from '../shared/lifetime.ts';
import { loadTypology, storePreview, typologyUrl } from '../typology/catalog.ts';
import type { TypologyEntry } from '../typology/catalog.ts';
import { activeTypology, setActiveTypology } from '../typology/index.ts';
import type { Typology } from '../typology/index.ts';

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
    const dimensionToggle = document.createElement('button');
    dimensionToggle.type = 'button';
    dimensionToggle.className = 'hedge-toggle';
    dimensionToggle.textContent = 'Dimensions · On';
    dimensionToggle.setAttribute('aria-pressed', 'true');
    dimensionToggle.setAttribute('aria-label', 'Toggle dimensions');
    const landscapeControls = document.createElement('div');
    landscapeControls.className = 'landscape-controls';
    landscapeControls.setAttribute('role', 'group');
    landscapeControls.setAttribute('aria-label', 'Landscape visibility');
    landscapeControls.append(hedgeToggle, treeToggle, dimensionToggle);
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
                if (mode === 'white') {
                    treesVisible = false;
                    rendering.setTreesVisible(false);
                } else rendering.setTreesVisible(treesVisible);
                syncTreeToggle();
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
        const syncTreeToggle = () => {
            const visible = treesVisible;
            treeToggle.setAttribute('aria-pressed', String(visible));
            treeToggle.textContent = visible ? 'Trees · On' : 'Trees · Off';
        };
        treeToggle.onclick = () => {
            treesVisible = !treesVisible;
            rendering.setTreesVisible(treesVisible);
            syncTreeToggle();
        };
        lifetime.add(() => { treeToggle.onclick = null; });
        let editSnapshot: { mode: HouseRepresentation; trees: boolean; fence: boolean } | undefined;
        const setLandscape = (trees: boolean, fence: boolean) => {
            treesVisible = trees;
            hedgeVisible = fence;
            rendering.setTreesVisible(trees);
            rendering.setHedgeVisible(fence);
            syncTreeToggle();
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
        let photoModelPending = false;
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
            house.entity.enabled = contextVisible && !inside && !photoModelPending;
        };
        let visibilityChanges = Promise.resolve();
        const setHouseVisible = (visible: boolean, model = house, valid: () => boolean = () => true) => {
            visibilityChanges = visibilityChanges.catch(() => {}).then(async () => {
                if (isDisposed() || !valid()) return;
                const wasVisible = model.entity.enabled;
                const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                if (visible) {
                    if (model === house) { photoModelPending = false; updateHouseVisibility(); }
                    else model.entity.enabled = true;
                    if (!wasVisible && model.entity.enabled && animate)
                        await fadeHouseModel(app, model.entity, 0, 1, lifetime.signal);
                } else {
                    if (wasVisible && animate) await fadeHouseModel(app, model.entity, 1, 0, lifetime.signal);
                    if (isDisposed() || !valid()) return;
                    if (model === house) photoModelPending = true;
                    model.entity.enabled = false;
                }
            });
            return visibilityChanges;
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
            (bounds, basis, preserveView = true) => {
                const size = { width: viewport.clientWidth, height: viewport.clientHeight };
                if (bounds) camera.fit(bounds, size, true, basis, preserveView);
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
                preserveSiteView = step === 'site';
                placement.setPlacementActive(step === 'placement');
                const isRendering = step === 'rendering';
                renderModes.hidden = isRendering;
                dimensionToggle.hidden = isRendering;
                if (isRendering) {
                    void setSceneMode('render').catch(error => {
                        if (isDisposed()) return;
                        console.error(error);
                        status.textContent = 'Could not load detailed render. Return to product placement and try again.';
                        status.hidden = false;
                    });
                }
                site.setMeasurementsVisible(step === 'site' && dimensionsVisible);
                coordinator.resize({ width: viewport.clientWidth, height: viewport.clientHeight }, true);
                site.refreshLabels(camera.project);
                document.title =
                    isRendering ? 'House & Ground — Rendering' : step === 'placement'
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
        let preserveSiteView = true;
        let dimensionsVisible = true;
        const coordinator = createSceneCoordinator(site, camera, () => house.bounds, () => site.getBounds(), () => true);
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
            if (detailBounds) camera.fit(detailBounds, { width, height }, false, placement.focusBasis(), true);
            placement.refreshLabels();
        };

        const observer = new ResizeObserver(resize);
        observer.observe(viewport);
        lifetime.add(() => observer.disconnect());
        dimensionControls.update(site.getLayout());
        viewControls.update(camera.getState().activePresetId);
        resize();
        // Thumbnail models and image URLs live independently of the interactive house.
        const previewAssets = createProductAssetStore(app, lifetime.signal);
        const previews = new Map<string, ReturnType<typeof createModelPreview>>();
        const previewRequests = new Map<string, number>();
        lifetime.add(() => { for (const preview of previews.values()) preview.destroy(); previewAssets.destroy(); });
        const renderPreview = (entry: TypologyEntry) => {
            const typology = activeTypology();
            const bounds = structuredClone(house.bounds);
            const request = (previewRequests.get(entry.id) ?? 0) + 1;
            previewRequests.set(entry.id, request);
            void (async () => {
                const url = `${entry.baseUrl}${typology.representations.render.model}`;
                const resource = await previewAssets.load(`${url}${url.includes('?') ? '&' : '?'}thumbnail=${entry.buildVersion ?? 1}`);
                if (isDisposed() || previewRequests.get(entry.id) !== request) return;
                const model = resource.instantiateRenderEntity();
                const { sourceFootprint: footprint, groundY } = typology.calibration;
                model.setPosition(-(footprint.minX + footprint.maxX) / 2, -groundY, -(footprint.minZ + footprint.maxZ) / 2);
                model.forEach(node => { if (node instanceof Entity && node.render) node.render.layers = []; });
                app.root.addChild(model);
                let current: ReturnType<typeof createModelPreview> | undefined;
                try {
                    current = createModelPreview(app, model, bounds);
                    const imageUrl = await current.ready;
                    if (isDisposed() || previewRequests.get(entry.id) !== request || !imageUrl) { current.destroy(); return; }
                    const previous = previews.get(entry.id);
                    previews.set(entry.id, current);
                    if (entry.source === 'photo' || !entry.previewUrl) await panel.setTypologyPreview(entry.id, imageUrl);
                    previous?.destroy();
                    const stored = await storePreview(entry, current.blob());
                    if (stored && !isDisposed() && previews.get(entry.id) === current) await panel.setTypologyPreview(entry.id, stored);
                } catch (error) {
                    if (current && previews.get(entry.id) !== current) current.destroy();
                    throw error;
                } finally { model.destroy(); }
            })().catch(error => console.warn('Model preview could not be generated', error));
        };
        panel.setActiveTypology(initial.id);
        renderPreview(initial);

        // Typology switch: replace only the house and what depends on it (yard envelope,
        // installation walls, placed products). App, camera, lighting, landscape and yard
        // dimensions are kept.
        let switching = Promise.resolve();
        const switchTypology = (entry: TypologyEntry, pushHistory = true, supplied?: Typology) => {
            switching = switching.then(async () => {
                if (isDisposed() || (entry.id === activeTypology().id && !supplied)) return;
                panel.setTypologyBusy(true);
                panel.setActiveTypology(entry.id);
                status.textContent = `Loading ${entry.name}…`;
                status.hidden = false;
                const previous = activeTypology();
                try {
                    const typology = supplied ?? (await loadTypology(entry.id)).typology;
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
                    const old = house;
                    await setHouseVisible(false, old);
                    house = next;
                    photoModelPending = false;
                    old.destroy();
                    placement.destroy();
                    placement = createPlacement();
                    placement.setPlacementActive(false);
                    site.setFootprint(house.footprint);
                    dimensionControls.update(site.getLayout());
                    updateSiteContext();
                    updateHouseVisibility();
                    coordinator.resize({ width: viewport.clientWidth, height: viewport.clientHeight }, true);
                    // Refit while hidden, then reveal through the shared transition.
                    house.entity.enabled = false;
                    await setHouseVisible(true);
                    if (!supplied) renderPreview(entry);
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
        const intake = createPhotoIntake({
            app,
            viewport,
            panelHost: document.querySelector<HTMLElement>('#panel')!,
            status,
            panel,
            camera,
            signal: lifetime.signal,
            isDisposed,
            syncSiteDimensions: () => site.setMeasurementsVisible(preserveSiteView && dimensionsVisible),
            scene: {
                switchTypology,
                whenSwitched: () => switching,
                setHouseVisible,
                house: () => house,
                renderPreview
            }
        });
        lifetime.add(() => intake.destroy());
        dimensionToggle.onclick = () => {
            dimensionsVisible = !dimensionsVisible;
            dimensionToggle.textContent = dimensionsVisible ? 'Dimensions · On' : 'Dimensions · Off';
            dimensionToggle.setAttribute('aria-pressed', String(dimensionsVisible));
            intake.setDimensionsVisible(dimensionsVisible); // also re-applies the site labels
        };
        lifetime.add(() => { dimensionToggle.onclick = null; });

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
