import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AppBase, AppOptions, CameraComponentSystem, LightComponentSystem, NullGraphicsDevice } from 'playcanvas';

import { createCameraController } from '../src/shared/camera/index.ts';
import { createDaylight } from '../src/site-definition/rendering/lighting.ts';

test('daylight covers resized plots and releases its light; extended camera depth survives transitions', () => {
    const canvas = {
        id: 'rendering-test',
        width: 400,
        height: 300,
        addEventListener() {
            /* No browser events in the headless renderer. */
        },
        removeEventListener() {
            /* No browser events in the headless renderer. */
        }
    };
    const app = new AppBase(canvas);
    const options = new AppOptions();
    options.graphicsDevice = new NullGraphicsDevice(canvas);
    options.componentSystems = [CameraComponentSystem, LightComponentSystem];
    app.init(options);
    const lighting = createDaylight(app);
    const camera = createCameraController(
        app,
        [
            { id: 'front', label: 'Front', direction: { x: 0, y: 1, z: 1 }, projection: 'perspective' },
            { id: 'side', label: 'Side', direction: { x: 1, y: 1, z: 0 } },
            { id: 'back', label: 'Back', direction: { x: 0, y: 1, z: -1 }, projection: 'perspective' }
        ],
        { minimumFarClip: 2500, maximumNearClip: 10 }
    );
    try {
        const bounds = { min: { x: -80, y: 0, z: -80 }, max: { x: 80, y: 25, z: 80 } };
        lighting.updateBounds(bounds);
        const light = app.root.findByName('Environment sunlight').light;
        assert.equal(light.castShadows, true);
        assert.ok(Math.abs(light.light.shadowBias) < 0.01, 'Shadow bias must not receive a millimetre conversion');
        assert.ok(light.normalOffsetBias < 1, 'Normal bias must stay below the engine clamp limit');
        assert.equal(light.numCascades, 1, 'Orthographic side cameras require a single shadow cascade');
        assert.ok(light.shadowDistance > 600);
        assert.equal(app.root.children.filter((entity) => entity.light).length, 1);
        camera.fit(bounds, { width: 400, height: 300 });
        camera.setView('side');
        app.fire('update', 0.4);
        for (const entity of app.root.children.filter((entity) => entity.camera))
            assert.equal(entity.camera.farClip, 2500);
        app.fire('update', 0.8);
        assert.equal(app.root.findByName('View: Side').camera.farClip, 2500);
        assert.equal(app.root.findByName('View: Side').camera.nearClip, 10);
        // Tall windows push a perspective camera far beyond a plot-only shadow range.
        for (const width of [980, 400, 220]) {
            camera.fit(bounds, { width, height: 1200 });
            for (const id of ['front', 'back', 'side']) {
                camera.setView(id);
                for (const dt of [0, 0.2, 0.3, 0.3, 1]) {
                    app.fire('update', dt);
                    app.fire('prerender');
                    const active = app.root.children.find((e) => e.camera && e.enabled);
                    const position = active.getPosition(),
                        forward = active.forward;
                    for (const x of [-80, 80])
                        for (const y of [0, 25])
                            for (const z of [-80, 80]) {
                                const depth =
                                    (x - position.x) * forward.x +
                                    (y - position.y) * forward.y +
                                    (z - position.z) * forward.z;
                                assert.ok(
                                    light.shadowDistance > depth,
                                    `shadow range ${light.shadowDistance} clips scene at depth ${depth} in ${id}, width ${width}`
                                );
                            }
                }
            }
        }
    } finally {
        camera.destroy();
        lighting.destroy();
        assert.equal(app.root.children.length, 0);
        app.destroy();
    }
});
