import assert from 'node:assert/strict';
import test from 'node:test';

import { AppBase, AppOptions, CameraComponentSystem, NullGraphicsDevice } from 'playcanvas';

import { createProductCamera } from '../src/customization/product-camera.ts';
import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';

test('product focus retargets from its rendered pose, converges and honors immediate mode', () => {
    const canvas = {
        id: 'focus-test',
        width: 800,
        height: 600,
        clientWidth: 800,
        clientHeight: 600,
        addEventListener() {
            /* Headless canvas. */
        },
        removeEventListener() {
            /* Headless canvas. */
        }
    };
    const app = new AppBase(canvas),
        options = new AppOptions();
    options.graphicsDevice = new NullGraphicsDevice(canvas);
    options.componentSystems = [CameraComponentSystem];
    app.init(options);
    const camera = createProductCamera(app, canvas, () => defaultVarendaParams, { duration: 0.8 });
    camera.fit(false);
    const target = { min: { x: 10, y: 20, z: 30 }, max: { x: 14, y: 24, z: 70 } };
    camera.focus(target);
    app.fire('update', 0.2);
    const current = camera.entity.getPosition().clone();
    camera.focus({ min: { x: 100, y: 20, z: 30 }, max: { x: 104, y: 24, z: 70 } });
    assert.deepEqual(camera.entity.getPosition().toArray(), current.toArray());
    app.fire('update', 0.8);
    const final = camera.entity.getPosition().clone();
    app.fire('update', 0.8);
    assert.deepEqual(camera.entity.getPosition().toArray(), final.toArray());
    camera.focus(target, false);
    assert.notDeepEqual(camera.entity.getPosition().toArray(), final.toArray());
    camera.destroy();
    app.destroy();
});
