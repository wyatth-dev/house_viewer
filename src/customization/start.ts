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

import { varendaDatums } from '../products/parametric-engine/varenda/datums.ts';
import { solveGlazing } from '../products/parametric-engine/varenda/glazing-solver.ts';
import type { VarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import { defaultVarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import {
    solveColumnLayout,
    solveFootings,
    solvePosts,
    solveGutterLayout,
    solveWallPieceLayout,
    solveRoofSlope,
    solveRafters,
    solveRailEndCaps
} from '../products/parametric-engine/varenda/varenda-solver.ts';
import { createVarendaView } from '../products/varenda/view/varenda-view.ts';
import { createProductAssetStore } from '../shared/assets/containers.ts';
import { createLifetime } from '../shared/lifetime.ts';

import { logProductDiagnostics } from './diagnostics.ts';
import { bindParameterInputs } from './parameter-inputs.ts';
import { createProductCamera } from './product-camera.ts';

export function startCustomization() {
    const canvas = document.querySelector<HTMLCanvasElement>('#lab-canvas')!;
    const status = document.querySelector<HTMLElement>('#lab-status')!;
    const lifetime = createLifetime();

    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '70vh';

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
        app.setCanvasFillMode(FILLMODE_NONE, canvas.clientWidth, canvas.clientHeight);
        app.setCanvasResolution(RESOLUTION_AUTO);
        lifetime.add(() => app.destroy());

        const params = { ...defaultVarendaParams };
        const productCamera = createProductCamera(app, canvas, () => params);
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

        // Solve all parts against one layout before replacing the last valid scene.
        const updateColumns = (nextParams: VarendaParams) => {
            const columnLayout = solveColumnLayout(nextParams);
            const footings = solveFootings(columnLayout, varendaDatums);
            const posts = solvePosts(columnLayout, nextParams, varendaDatums);
            const gutter = solveGutterLayout(nextParams);
            const wallPiece = solveWallPieceLayout(nextParams);
            const roofSlope = solveRoofSlope(nextParams);
            const rafters = solveRafters(nextParams);
            const endCaps = solveRailEndCaps(gutter, wallPiece);
            const glazing = solveGlazing(nextParams, rafters);
            const solution = { footings, posts, gutter, wallPiece, roofSlope, rafters, endCaps, glazing };
            logProductDiagnostics(solution);

            // Commit to scene
            product.update(solution);

            product.root.setLocalPosition(-nextParams.widthMm / 2, 0, 0);
            Object.assign(params, nextParams);

            status.textContent =
                `Footing assemblies: ${footings.assemblies.length} · ` +
                `Local X: ${columnLayout.centersMm.join(', ')} mm · ` +
                `Outward depth: ${params.depthMm} mm · ` +
                `Roof slope: ${roofSlope.slopeDegrees.toFixed(3)}° · ` +
                `Glass panels: ${glazing.glass.length} · Gaskets: ${glazing.gaskets.length}`;
        };

        const inputs = bindParameterInputs(params, (draft) => {
            try {
                updateColumns(draft);
            } catch (error) {
                status.textContent = error instanceof Error ? error.message : 'Invalid input';
            }
        });
        lifetime.add(() => inputs.destroy());

        updateColumns({ ...params });

        const resize = () => {
            if (lifetime.signal.aborted) return;
            const width = canvas.clientWidth,
                height = canvas.clientHeight;
            if (!width || !height) return;
            app.resizeCanvas(width, height);
            productCamera.fit();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        lifetime.add(() => observer.disconnect());

        // Start only after assets, initial geometry and viewport are ready.
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
}
