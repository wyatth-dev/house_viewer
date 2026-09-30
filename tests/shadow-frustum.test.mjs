import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AppBase, AppOptions, CameraComponentSystem, NullGraphicsDevice } from 'playcanvas';

import { createCameraController } from '../src/camera/index.ts';

test('shadow frustum follows the rendered lens throughout interrupted and completed transitions', () => {
    const canvas = {
        id: 'shadow-frustum',
        width: 980,
        height: 720,
        addEventListener() {
            /* Headless canvas has no DOM events. */
        },
        removeEventListener() {
            /* Headless canvas has no DOM events. */
        }
    };
    const app = new AppBase(canvas);
    const options = new AppOptions();
    options.graphicsDevice = new NullGraphicsDevice(canvas);
    options.componentSystems = [CameraComponentSystem];
    app.init(options);
    const controller = createCameraController(
        app,
        [
            { id: 'front', label: 'Front', direction: { x: 0.34, y: 0.84, z: 0.94 }, projection: 'perspective' },
            { id: 'left', label: 'Left', direction: { x: -1, y: 0.84, z: 0 } },
            { id: 'back', label: 'Back', direction: { x: -0.34, y: 0.84, z: -0.94 }, projection: 'perspective' }
        ],
        { minimumFarClip: 2500000, maximumNearClip: 10000 }
    );
    const bounds = { min: { x: -25000, y: 0, z: -35000 }, max: { x: 25000, y: 19000, z: 35000 } };
    const check = () => {
        const component = app.root.children.find((entity) => entity.enabled && entity.camera).camera;
        const camera = component.camera;
        camera.updateFrustum();
        const m = component.projectionMatrix.data;
        // Shadow mapping requests a shorter far distance than the main environment camera.
        for (const p of camera.getFrustumCorners(component.nearClip, 250000)) {
            const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
            const x = (m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]) / w;
            const y = (m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]) / w;
            assert.ok(Math.abs(Math.abs(x) - 1) < 1e-5, `shadow corner x=${x} misses rendered edge`);
            assert.ok(Math.abs(Math.abs(y) - 1) < 1e-5, `shadow corner y=${y} misses rendered edge`);
        }
    };
    try {
        controller.fit(bounds, { width: 980, height: 720 });
        check();
        for (const id of ['left', 'back', 'front', 'left']) {
            controller.setView(id);
            check();
            for (const dt of [0.01, 0.2, 0.2]) {
                app.fire('update', dt);
                check();
            }
        }
        app.fire('update', 1);
        check();
        controller.fit(bounds, { width: 375, height: 490 });
        check();
    } finally {
        controller.destroy();
        app.destroy();
    }
});
