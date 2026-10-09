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

import { fileUrl, getPhotoModel } from '../photo-intake/api.ts';
import { createPhotoIntake } from '../photo-intake/controller.ts';
import { createPlacementController } from '../product-placement/controller.ts';
import { saveProject } from '../projects/api.ts';
import { createAutosave } from '../projects/autosave.ts';
import { createEditorState } from '../projects/editor-state.ts';
import { createProjectBar } from '../projects/project-bar.ts';
import { houseOf, planSwitch, previewExit, recordForSwitch, restoreProject } from '../projects/restore.ts';
import type { ProjectDocument } from '../projects/state.ts';
import { createCaptureButton } from '../rendering/capture-button.ts';
import { createRenderingController } from '../rendering/controller.ts';
import { fadeHouseModel } from '../scene/house/fade.ts';
import type { HouseRepresentation } from '../scene/house/house-config.ts';
import { loadHouse } from '../scene/house/house.ts';
import { houseRepresentationIcon } from '../scene/house/representation-icon.ts';
import { createModelPreview } from '../scene/model-preview/index.ts';
import { createProductAssetStore } from '../shared/assets/containers.ts';
import { createCameraController, createCameraControls, createOrbitControls } from '../shared/camera/index.ts';
import { createLifetime } from '../shared/lifetime.ts';
import { loadTypology, storePreview } from '../typology/catalog.ts';
import type { TypologyEntry } from '../typology/catalog.ts';
import { activeTypology, setActiveTypology } from '../typology/index.ts';
import type { Typology } from '../typology/index.ts';

import { cameraPresets } from './camera-presets.ts';
import { createSiteController, createSiteControls } from './index.ts';
import { createPanel } from './panel.ts';
import { createRendering, daylightConfig } from './rendering/index.ts';
import { createSceneCoordinator } from './scene-controller.ts';
import './style.css';

/**
 * `initial` is the typology already made active by main.ts (resolveTypology: the project's house,
 * or Fairy when that house no longer exists). `project` is the saved project document; the scene
 * is restored from it and every edit is written back through autosave.
 */
export function startSiteDefinition(initial: TypologyEntry, project: ProjectDocument) {
    const projectId = project.id;
    const canvas = document.querySelector<HTMLCanvasElement>('#application-canvas')!;
    const viewport = document.querySelector<HTMLElement>('#viewport')!;
    const status = document.querySelector<HTMLElement>('#status')!;
    const panelHost = document.querySelector<HTMLElement>('#panel')!;
    const panel = createPanel(panelHost, projectId);
    const lifetime = createLifetime();
    lifetime.add(() => panel.destroy());

    // Persistence: one autosave per opened project; all editor writes go through `editor.record`.
    const autosave = createAutosave(project, saveProject);
    lifetime.add(() => autosave.destroy());
    const editor = createEditorState(autosave);
    const projectBar = createProjectBar(autosave, (name) => editor.record(doc => ({ ...doc, name })));
    panelHost.prepend(projectBar.element);
    lifetime.add(() => projectBar.destroy());
    const beforeUnload = (event: BeforeUnloadEvent) => {
        // A failed keepalive save stays pending; hasPendingChanges() below asks the user to stay.
        void autosave.flush(true).catch(() => undefined);
        if (autosave.hasPendingChanges()) {
            event.preventDefault();
            event.returnValue = '';
        }
    };
    window.addEventListener('beforeunload', beforeUnload);
    lifetime.add(() => window.removeEventListener('beforeunload', beforeUnload));
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
        const renderingController = createRenderingController({
            projectId,
            autosave,
            elements: panel.rendering,
            async captureView() {
                await modeChanges;
                if (isDisposed()) throw new Error('Editor closed');
                const cameraSnapshot = camera.snapshot();
                app.render();
                const snapshot = document.createElement('canvas');
                const scale = Math.min(1, 1600 / Math.max(canvas.width, canvas.height));
                snapshot.width = Math.max(1, Math.round(canvas.width * scale));
                snapshot.height = Math.max(1, Math.round(canvas.height * scale));
                snapshot.getContext('2d')!.drawImage(canvas, 0, 0, snapshot.width, snapshot.height);
                const blob = await new Promise<Blob>((resolve, reject) => snapshot.toBlob(
                    result => (result ? resolve(result) : reject(new Error('The view could not be captured.'))), 'image/jpeg', 0.92));
                const flash = document.createElement('div');
                flash.className = 'capture-flash';
                flash.setAttribute('aria-hidden', 'true');
                viewport.append(flash);
                // Camera flash over the whole viewport.
                const animation = flash.animate([{ opacity: 0.85 }, { opacity: 0 }], {
                    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 320,
                    easing: 'ease-out'
                });
                animation.onfinish = () => flash.remove();
                animation.oncancel = () => flash.remove();
                return { blob, camera: cameraSnapshot };
            },
            restoreCamera: snapshot => camera.restore(snapshot),
            async loadHousePhoto(modelId) {
                const model = await getPhotoModel(projectId, modelId);
                const photo = model.photos.find(candidate => candidate.primary) ?? model.photos[0];
                return photo ? { url: fileUrl(projectId, modelId, photo.file), name: model.name ?? 'House photo' } : null;
            }
        });
        lifetime.add(() => renderingController.destroy());
        const captureButton = createCaptureButton(viewport, () => renderingController.capture());
        lifetime.add(() => captureButton.destroy());

        const setSceneMode = (mode: HouseRepresentation) => {
            currentMode = mode;
            // The previous change's failure was reported to its caller; the queue continues.
            modeChanges = modeChanges.catch(() => undefined).then(async () => {
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
                    recordDisplay();
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
            recordDisplay();
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
            recordDisplay();
        };
        lifetime.add(() => { treeToggle.onclick = null; });
        let editSnapshot: { mode: HouseRepresentation; trees: boolean; fence: boolean } | undefined;
        // The user's display preferences. While a product is edited the scene is temporarily
        // white without landscape; the saved preferences are the ones it returns to.
        const recordDisplay = () => {
            const shown = editSnapshot ?? { mode: currentMode, trees: treesVisible, fence: hedgeVisible };
            editor.record(doc => ({
                ...doc,
                display: { representation: shown.mode, trees: shown.trees, fence: shown.fence, dimensions: dimensionsVisible }
            }));
        };
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
            // The previous change's failure was reported to its caller; the queue continues.
            visibilityChanges = visibilityChanges.catch(() => undefined).then(async () => {
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
            editModeChanged,
            () => {
                // Products on a temporary preview build do not belong to the project's house:
                // say so instead of showing Saved for a change that is not stored.
                if (previewing) {
                    status.textContent = 'This build is not published yet: product changes on it are not saved.';
                    status.hidden = false;
                    return;
                }
                const products = placement.snapshot();
                editor.record(doc => ({ ...doc, products }));
            }
        );
        /** The scene shows a not yet published photo build, which is not saved as the house. */
        let previewing = false;
        // Recreated when the typology changes: placed products belong to the previous house's walls.
        let placement = createPlacement();
        lifetime.add(() => placement.destroy());

        const selectProduct = () => placement.toggleProduct('varenda');
        productChoice.addEventListener('click', selectProduct);
        lifetime.add(() => productChoice.removeEventListener('click', selectProduct));

        lifetime.add(camera.onMove(() => placement.refreshLabels()));
        let renderingPhotosRequest = 0;
        lifetime.add(
            panel.onStepChange((step) => {
                preserveSiteView = step === 'site';
                placement.setPlacementActive(step === 'placement');
                const isRendering = step === 'rendering';
                if (isRendering) {
                    renderingController.refresh();
                    const products = placement.snapshot();
                    panel.setRenderingFocusObjects([
                        { id: 'site', label: 'Site' },
                        ...products.map((product, index) => ({ id: product.instanceId,
                            label: products.length === 1 ? 'Product' : `Product ${index + 1}` }))
                    ], id => {
                        const size = { width: viewport.clientWidth, height: viewport.clientHeight };
                        if (id === 'site') {
                            const bounds = site.getBounds();
                            camera.fit({ min: { ...bounds.min }, max: { ...bounds.max, y: house.bounds.max.y } }, size, true, undefined, true);
                        } else {
                            const bounds = placement.getProductBounds(id);
                            if (bounds) camera.fit(bounds, size, true, undefined, true);
                        }
                    });
                }
                const photoRequest = ++renderingPhotosRequest;
                panel.setRenderingPhotos([]);
                const projectHouse = autosave.get().house;
                if (isRendering && projectHouse?.source === 'photo') {
                    const modelId = projectHouse.typologyId;
                    void getPhotoModel(project.id, modelId).then(model => {
                        if (isDisposed() || photoRequest !== renderingPhotosRequest) return;
                        const photos = [...model.photos, ...Object.values(model.facadePhotos ?? {}).flat()];
                        const unique = [...new Map(photos.map(photo => [photo.file, photo])).values()];
                        panel.setRenderingPhotos(unique.map(photo => ({
                            url: fileUrl(project.id, modelId, photo.file), name: 'Uploaded house photo'
                        })));
                    }).catch(error => console.error('Could not load rendering photos', error));
                }
                renderModes.hidden = isRendering;
                captureButton.setVisible(isRendering);
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
        const recordDimensions = () => {
            const dimensionsMm = site.getState().dimensions;
            editor.record(doc => ({ ...doc, site: { dimensionsMm } }));
        };
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
                    recordDimensions();
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
            recordDimensions();
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
        const switchTypology = (entry: TypologyEntry, supplied?: Typology) => {
            switching = switching.then(async () => {
                if (isDisposed()) return;
                const plan = planSwitch(autosave.get(), activeTypology(), entry, Boolean(supplied));
                if (plan.skip) return;
                panel.setTypologyBusy(true);
                panel.setActiveTypology(entry.id);
                status.textContent = `Loading ${entry.name}…`;
                status.hidden = false;
                const previous = activeTypology();
                try {
                    const typology = supplied ?? (await loadTypology(entry.id, projectId)).typology;
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
                    status.hidden = true;
                    // The old house's products were dropped with the old placement controller. A new
                    // listed house is saved without products; a preview build is not saved at all,
                    // and returning to the saved house shows its saved products again.
                    previewing = plan.previewing;
                    if (plan.record) editor.record(doc => recordForSwitch(doc, entry) ?? doc);
                    else if (plan.replaceSaved) {
                        editor.beginRestore();
                        try {
                            await placement.restore(autosave.get().products);
                            if (!isDisposed()) placement.refresh();
                        } finally {
                            editor.endRestore();
                        }
                    }
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
        const setDimensionsShown = (visible: boolean) => {
            dimensionsVisible = visible;
            dimensionToggle.textContent = visible ? 'Dimensions · On' : 'Dimensions · Off';
            dimensionToggle.setAttribute('aria-pressed', String(visible));
        };
        // Restore the saved project: house (main.ts) → yard → display → products. Changes made
        // while applying it are not recorded; a corrected state is saved once afterwards.
        const restored = await restoreProject(autosave.get(), houseOf(initial), editor, {
            setDimensions(dimensionsMm) {
                if (Object.keys(coordinator.setDimensions(dimensionsMm)).length) return false;
                dimensionControls.syncDimensions(site.getState().dimensions);
                dimensionControls.update(site.getLayout());
                updateSiteContext();
                return true;
            },
            async applyDisplay({ representation, trees, fence, dimensions }) {
                setLandscape(trees, fence);
                setDimensionsShown(dimensions);
                site.setMeasurementsVisible(preserveSiteView && dimensions);
                if (representation !== currentMode) await setSceneMode(representation);
            },
            async restoreProducts(records) {
                const { skipped } = await placement.restore(records);
                if (!isDisposed()) placement.refresh();
                return { skipped };
            },
            state: () => ({ dimensionsMm: site.getState().dimensions, products: placement.snapshot() }),
            isDisposed
        });
        lifetime.signal.throwIfAborted();
        const restoreNotice = restored?.notice ?? null;

        const intake = createPhotoIntake({
            projectId,
            integratedPhotoModelId: initial.source === 'photo' ? (initial.photoModelId ?? initial.id) : undefined,
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
                async leavePreview() {
                    await switching;
                    const id = previewExit(autosave.get(), previewing);
                    if (id === null || isDisposed()) return;
                    const { entry } = await loadTypology(id, projectId);
                    await switchTypology(entry);
                },
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
            recordDisplay();
        };
        lifetime.add(() => { dimensionToggle.onclick = null; });

        lifetime.add(panel.onSelectTypology((entry) => void switchTypology(entry)));
        // Startup
        app.start();
        panel.enable();
        status.hidden = true;
        if (restoreNotice) {
            const message = document.createElement('p');
            message.textContent = restoreNotice;
            const dismiss = document.createElement('button');
            dismiss.type = 'button';
            dismiss.textContent = 'OK';
            dismiss.onclick = () => { status.hidden = true; };
            status.replaceChildren(message, dismiss);
            status.hidden = false;
        }
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
