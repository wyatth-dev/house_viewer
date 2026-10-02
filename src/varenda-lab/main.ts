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

import { createLifetime } from '../app/lifetime.ts';
import { fitPerspective } from '../camera/framing.ts';
import { varendaDatums } from '../parametric-engine/varenda/datums.ts';
import type { VarendaParams } from '../parametric-engine/varenda/parameters.ts';
import { defaultVarendaParams } from '../parametric-engine/varenda/parameters.ts';
import { 
    solveColumnLayout, 
    solveFootings, 
    solvePosts, 
    solveGutterLayout, 
    solveWallPieceLayout, 
    solveRoofSlope,
    solveSingleRafter
} from '../parametric-engine/varenda/varenda-solver.ts';
import { createProductAssetStore } from '../product-view/assets.ts';
import { createVarendaView } from '../product-view/varenda-view.ts';

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

    const camera = new Entity('Lab camera');
    camera.addComponent('camera', {
        clearColor: new Color(0.9, 0.92, 0.94),
        nearClip: 1,
        farClip: 10000
    });
    app.root.addChild(camera);

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

    // Last valid engineering parameters. Presentation offset belongs to the root.
    const params = { ...defaultVarendaParams };

    // Solve all parts against one layout before replacing the last valid scene.
    const updateColumns = (nextParams: VarendaParams) => {
        const columnLayout = solveColumnLayout(nextParams);
        const footings = solveFootings(columnLayout, varendaDatums);
        const posts = solvePosts(columnLayout, nextParams, varendaDatums);
        const gutter = solveGutterLayout(nextParams);
        const wallPiece = solveWallPieceLayout(nextParams);
        const roofSlope = solveRoofSlope(nextParams);
        const rafter = solveSingleRafter(nextParams)

        // POST HOLE MARKERS: local Z and source diameter only; no assembly transforms applied.
        console.table(
            posts[0].holeMarkers.map((marker) => ({
                part: marker.partInstanceId,
                marker: marker.markerId,
                localZMm: marker.centerMm.z,
                diameterMm: marker.sourceDiameterMm,
            }))
        );

        // Commit to scene
        product.update({ footings, posts, gutter, wallPiece, roofSlope, rafter });
        product.root.setLocalPosition(-nextParams.widthMm / 2, 0, 0);
        Object.assign(params, nextParams);

        status.textContent =
            `Footing assemblies: ${footings.assemblies.length} · ` +
            `Local X: ${columnLayout.centresMm.join(', ')} mm · ` +
            `Outward depth: ${params.depthMm} mm · ` +
            `Roof slope: ${roofSlope.slopeDegrees.toFixed(3)}°`;
    };

    // Controls: drafts may be invalid; only successful solves commit to params.
    const widthInput = document.querySelector<HTMLInputElement>('#product-width')!;
    const intervalInput = document.querySelector<HTMLInputElement>('#post-interval')!;
    const depthInput = document.querySelector<HTMLInputElement>('#product-depth')!;
    const heightInput = document.querySelector<HTMLInputElement>('#underside-height')!;
    const wallHeightInput = document.querySelector<HTMLInputElement>('#wall-height')!;

    widthInput.value = String(params.widthMm);
    intervalInput.value = String(params.postInterval);
    depthInput.value = String(params.depthMm);
    heightInput.value = String(params.undersideHeightMm);
    wallHeightInput.value = String(params.wallHeightMm);

    const onParametersInput = () => {
        try {
            updateColumns({
                ...params,
                widthMm: widthInput.valueAsNumber,
                depthMm: depthInput.valueAsNumber,
                postInterval: intervalInput.valueAsNumber,
                undersideHeightMm: heightInput.valueAsNumber,
                wallHeightMm: wallHeightInput.valueAsNumber
            });
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : 'Invalid input';
        }
    };

    for (const input of [widthInput, intervalInput, depthInput, heightInput, wallHeightInput]) {
        input.addEventListener('input', onParametersInput);
        lifetime.add(() => {
            input.removeEventListener('input', onParametersInput);
        });
    }

    updateColumns({ ...params });

    // Camera: parameter input never refits; Overview and window resizing do.
    const fitProduct = () => {
        if (lifetime.signal.aborted) return;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;

        const frame = fitPerspective(
            {
                min: {
                    x: -params.widthMm / 2 - 100,
                    y: 0,
                    z: -100
                },
                max: {
                    x: params.widthMm / 2 + 100,
                    y: Math.max(
                        params.undersideHeightMm + 150,
                        params.wallHeightMm + 150
                    ),
                    z: params.depthMm + 100
                }
            },
            { width, height },
            { x: 0.2, y: 0.7, z: 1 },
            45
        );

        camera.setPosition(frame.position.x, frame.position.y, frame.position.z);

        camera.lookAt(frame.center.x, frame.center.y, frame.center.z);

        camera.camera!.nearClip = frame.near;
        camera.camera!.farClip = frame.far;
    };

    const fitButton = document.querySelector<HTMLButtonElement>('#fit-product')!;

    fitButton.addEventListener('click', fitProduct);

    lifetime.add(() => {
        fitButton.removeEventListener('click', fitProduct);
    });

    const resize = () => {
        if (lifetime.signal.aborted) return;
        const width = canvas.clientWidth,
            height = canvas.clientHeight;
        if (!width || !height) return;
        app.resizeCanvas(width, height);
        fitProduct();
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
