import {
    AppBase,
    AppOptions,
    FILLMODE_NONE,
    RESOLUTION_AUTO,
    CameraComponentSystem,
    ContainerHandler,
    LightComponentSystem,
    RenderComponentSystem,
    TextureHandler,
    Entity,
    Color,
    createGraphicsDevice
} from 'playcanvas';

import type { VarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import { defaultVarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import { buildProductionList } from '../products/parametric-engine/varenda/production-list.ts';
import { buildInstallationMenus } from '../products/parametric-engine/varenda/production-relations.ts';
import { solveVarenda } from '../products/parametric-engine/varenda/solution.ts';
import { createVarendaView } from '../products/varenda/view/varenda-view.ts';
import { createProductAssetStore } from '../shared/assets/containers.ts';
import { createLifetime } from '../shared/lifetime.ts';

import { logProductDiagnostics } from './diagnostics.ts';
import { createCustomizationPanel } from './panel.ts';
import { bindParameterInputs } from './parameter-inputs.ts';
import { createProductCamera } from './product-camera.ts';
import type { DisplayProductionRow } from './production-groups.ts';
import { groupProductionRows } from './production-groups.ts';
import type { InstanceNavigation, InstanceSelection } from './selection-state.ts';
import { navigateInstance, reconcileSelection, selectionContext, toggleGroup } from './selection-state.ts';
import './style.css';

export function startCustomization() {
    const canvas = document.querySelector<HTMLCanvasElement>('#lab-canvas')!;
    const viewport = document.querySelector<HTMLElement>('.product-viewport')!;
    const status = document.querySelector<HTMLElement>('#lab-status')!;
    const lifetime = createLifetime();

    let selectRow: (id: string) => void = () => {
        /* Inputs are disabled until the scene is ready. */
    };
    let overview: () => void = () => {
        /* Inputs are disabled until the scene is ready. */
    };
    let selectInstance: (id: string, navigation?: InstanceNavigation, menuId?: string) => void = () => {
        /* Scene is loading. */
    };
    const panel = createCustomizationPanel(
        document.querySelector<HTMLElement>('#product-panel')!,
        (id) => selectRow(id),
        () => overview(),
        (id, navigation, menuId) => selectInstance(id, navigation, menuId)
    );
    lifetime.add(() => panel.destroy());

    async function start() {
        const device = await createGraphicsDevice(canvas);
        device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);

        if (lifetime.signal.aborted) {
            device.destroy();
            return;
        }

        // Scene setup
        const options = new AppOptions();
        options.graphicsDevice = device;
        options.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem];
        options.resourceHandlers = [TextureHandler, ContainerHandler];

        const app = new AppBase(canvas);
        app.init(options);
        app.setCanvasFillMode(FILLMODE_NONE, viewport.clientWidth, viewport.clientHeight);
        app.setCanvasResolution(RESOLUTION_AUTO);
        lifetime.add(() => app.destroy());

        const params = { ...defaultVarendaParams };
        const productCamera = createProductCamera(app, canvas, () => params, {
            duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.8
        });
        const camera = productCamera.entity;
        lifetime.add(() => productCamera.destroy());

        const light = new Entity('Lab light');
        light.addComponent('light', {
            type: 'directional',
            intensity: 1.5
        });
        light.setEulerAngles(45, 30, 0);
        app.root.addChild(light);
        app.scene.ambientLight = new Color(0.35, 0.35, 0.35);

        // Assets and product rendering are shared with future scene integration.
        const assets = createProductAssetStore(app, lifetime.signal);
        lifetime.add(() => assets.destroy());
        const product = await createVarendaView(app, assets);
        lifetime.add(() => product.destroy());
        lifetime.signal.throwIfAborted();

        const detailInput = document.querySelector<HTMLInputElement>('#glazing-details')!;
        const updateGlazingDetails = () => {
            // Side gasket widths are about 10 mm. Reveal mesh detail only when resolved on screen or requested.
            const distance = camera.getPosition().length();
            const pixels = (10 * canvas.clientHeight) / (2 * Math.tan(Math.PI / 8) * Math.max(1, distance));
            product.setGlazingDetailVisible(detailInput.checked || pixels >= 2);
        };
        app.on('update', updateGlazingDetails);
        lifetime.add(() => app.off('update', updateGlazingDetails));

        let rows: DisplayProductionRow[] = [];
        let selectedId: string | undefined;
        let instanceSelection: InstanceSelection | undefined;
        const menus = new Map<string, Set<string>>();
        let installations: ReadonlyMap<string, readonly string[]> = new Map();
        const caption = document.querySelector<HTMLElement>('#selection-caption')!;
        selectRow = (id) => {
            const row = rows.find((candidate) => candidate.id === id);
            if (!row) return;
            toggleGroup(menus, id);
            if (!menus.has(id)) {
                overview();
                return;
            }
            instanceSelection = undefined;
            const bounds = product.select(row.instanceIds);
            selectedId = id;
            caption.textContent = `${row.label} · ${row.quantity} selected`;
            panel.update(rows, selectedId, instanceSelection, menus, installations);
            if (bounds) productCamera.focus(bounds);
        };
        selectInstance = (id, navigation = 'direct', menuId = selectedId) => {
            const row = rows.find((candidate) => candidate.instanceIds.includes(id));
            if (!row || !rows.some((candidate) => candidate.instanceIds.includes(id))) return;
            if (menuId) {
                selectedId = menuId;
                if (navigation === 'direct') {
                    const wasOpen = menus.get(menuId)?.has(id) ?? false;
                    menus.set(menuId, new Set(wasOpen ? [] : [id]));
                }
            }
            // Instance focus does not change the expanded HUD group.
            instanceSelection = navigateInstance(instanceSelection, id, navigation);
            const group = rows.find((candidate) => candidate.id === selectedId);
            const bounds = product.select([id], selectionContext(instanceSelection, group?.instanceIds ?? []));
            const part = rows.find((candidate) => candidate.instanceIds.includes(id))!;
            caption.textContent = `${part.label} · ${id}`;
            panel.update(rows, selectedId, instanceSelection, menus, installations);
            if (bounds) productCamera.focus(bounds);
        };
        overview = () => {
            selectedId = undefined;
            instanceSelection = undefined;
            product.clearSelection();
            panel.update(rows, undefined, undefined, menus, installations);
            caption.textContent = 'All components';
            productCamera.focus(product.getBounds());
        };
        const overviewButton = document.querySelector<HTMLButtonElement>('#fit-product')!;
        const handleOverview = () => overview();
        overviewButton.addEventListener('click', handleOverview);
        lifetime.add(() => overviewButton.removeEventListener('click', handleOverview));

        const updateColumns = (nextParams: VarendaParams) => {
            const solution = solveVarenda(nextParams);
            const nextRows = groupProductionRows(buildProductionList(solution));
            logProductDiagnostics(solution);
            product.update(solution);
            product.root.setLocalPosition(-nextParams.widthMm / 2, 0, 0);
            Object.assign(params, nextParams);
            rows = nextRows;
            installations = buildInstallationMenus(solution);
            for (const [menuId, ids] of menus) {
                if (!rows.some((row) => row.id === menuId)) menus.delete(menuId);
                else for (const id of ids) if (!rows.some((row) => row.instanceIds.includes(id))) ids.delete(id);
            }
            const retained = reconcileSelection(rows, selectedId);
            selectedId = retained?.id;
            if (!retained || !rows.some((row) => row.instanceIds.includes(instanceSelection?.id ?? '')))
                instanceSelection = undefined;
            if (instanceSelection)
                instanceSelection = {
                    ...instanceSelection,
                    path: instanceSelection.path.filter((id) => rows.some((row) => row.instanceIds.includes(id)))
                };
            if (retained)
                product.select(
                    instanceSelection ? [instanceSelection.id] : retained.instanceIds,
                    selectionContext(instanceSelection, retained.instanceIds)
                );
            caption.textContent = instanceSelection
                ? instanceSelection.id
                : retained
                  ? `${retained.label} · ${retained.quantity} selected`
                  : 'All components';
            panel.update(rows, selectedId, instanceSelection, menus, installations);
            status.classList.remove('error');
            status.textContent = `${solution.footings.assemblies.length} posts · ${solution.glazing.glass.length} glass panels · Roof slope ${solution.roofSlope.slopeDegrees.toFixed(2)}°`;
        };

        const inputs = bindParameterInputs(params, (draft) => {
            try {
                updateColumns(draft);
            } catch (error) {
                status.classList.add('error');
                status.textContent = error instanceof Error ? error.message : 'Invalid input';
            }
        });
        lifetime.add(() => inputs.destroy());

        updateColumns({ ...params });

        const resize = () => {
            if (lifetime.signal.aborted) return;
            const width = viewport.clientWidth,
                height = viewport.clientHeight;
            if (!width || !height) return;
            app.resizeCanvas(width, height);
            const active = reconcileSelection(rows, selectedId);
            const bounds = active
                ? product.select(
                      instanceSelection ? [instanceSelection.id] : active.instanceIds,
                      selectionContext(instanceSelection, active.instanceIds)
                  )
                : product.getBounds();
            if (bounds) productCamera.focus(bounds, false);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(viewport);
        lifetime.add(() => observer.disconnect());

        // Start only after assets, initial geometry and viewport are ready.
        resize();
        app.start();
        panel.enable();
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
}
