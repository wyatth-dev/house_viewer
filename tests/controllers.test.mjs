import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AppBase, AppOptions, CameraComponentSystem, NullGraphicsDevice, RenderComponentSystem } from 'playcanvas';

import { createCameraController } from '../src/shared/camera/index.ts';
import { createSiteController } from '../src/site-definition/index.ts';
function createApp() {
    const canvas = {
        id: 'test',
        width: 100,
        height: 100,
        addEventListener() {
            /* No browser events with NullGraphicsDevice. */
        },
        removeEventListener() {
            /* No browser events with NullGraphicsDevice. */
        }
    };
    const app = new AppBase(canvas),
        options = new AppOptions();
    options.graphicsDevice = new NullGraphicsDevice(canvas);
    options.componentSystems = [CameraComponentSystem, RenderComponentSystem];
    app.init(options);
    return app;
}
test('camera controller enables only the selected camera, rejects unknown IDs, and isolates snapshots', () => {
    const app = createApp();
    const c = createCameraController(app, [
        { id: 'a', label: 'A', direction: { x: 0, y: 1, z: 1 } },
        { id: 'b', label: 'B', direction: { x: 1, y: 1, z: 0 } }
    ]);
    try {
        c.getState().activePresetId = 'b';
        assert.equal(c.getState().activePresetId, 'a');
        c.setView('b');
        assert.deepEqual(
            app.root.children.map((e) => e.enabled),
            [false, true]
        );
        assert.throws(() => c.setView('missing'), /Unknown camera/);
        assert.equal(c.getState().activePresetId, 'b');
        for (let i = 0; i < 100; i++)
            c.fit({ min: { x: -i, y: 0, z: -2 }, max: { x: 10, y: 20, z: 10 } }, { width: 400, height: 600 });
        assert.equal(app.root.children.length, 2);
        assert.deepEqual(
            app.root.children.map((e) => e.enabled),
            [false, true]
        );
    } finally {
        c.destroy();
        assert.equal(app.root.children.length, 0);
        app.destroy();
    }
});
test('site updates reuse four surfaces, hide zero regions, reject invalid dimensions and protect snapshots', () => {
    const app = createApp();
    const oldDocument = globalThis.document;
    globalThis.document = {
        createElement() {
            return {
                append() {
                    /* DOM/engine stub for this test. */
                },
                setAttribute() {
                    /* DOM/engine stub for this test. */
                },
                remove() {
                    /* Labels are not attached to a real DOM in this test. */
                }
            };
        }
    };
    const site = createSiteController(
        app,
        { width: 8000, depth: 10000 },
        {
            append() {
                /* Exercise site state and engine resources without a browser DOM. */
            }
        }
    );
    try {
        site.getState().dimensions.front = 40;
        site.getLayout().property.minX = -999;
        assert.equal(site.getState().dimensions.front, 5000);
        assert.equal(site.getLayout().property.minX, -6000);
        assert.ok(site.setDimensions({ front: NaN, back: 7000, left: 2000, right: 2000 }).front);
        assert.equal(site.getState().dimensions.front, 5000);
        const root = app.root.children[0],
            original = [...root.children];
        for (let i = 0; i < 100; i++) site.setDimensions({ front: (i % 51) * 1000, back: 0, left: 0, right: 0 });
        assert.deepEqual(root.children, original);
        assert.equal(root.children.length, 4);
        site.setDimensions({ front: 0, back: 0, left: 0, right: 0 });
        assert.ok(root.children.every((e) => !e.enabled));
        assert.deepEqual(site.getBounds(), { min: { x: -4000, y: 0, z: -5000 }, max: { x: 4000, y: 60, z: 5000 } });
    } finally {
        site.destroy();
        assert.equal(app.root.children.length, 0);
        globalThis.document = oldDocument;
        app.destroy();
    }
});

test('camera travels smoothly, retargets from its current pose, and finishes exactly at the preset', () => {
    const app = createApp();
    const presets = [
        { id: 'front', label: 'Front', projection: 'perspective', direction: { x: 0.34, y: 0.84, z: 0.94 } },
        { id: 'back', label: 'Back', projection: 'perspective', direction: { x: -0.34, y: 0.84, z: -0.94 } },
        { id: 'side', label: 'Side', direction: { x: 1, y: 0.84, z: 0 } }
    ];
    const camera = createCameraController(app, presets, { duration: 0.8 });
    try {
        camera.fit({ min: { x: -23, y: 0, z: -35 }, max: { x: 23, y: 19, z: 35 } }, { width: 900, height: 700 });
        const front = app.root.children[0],
            back = app.root.children[1],
            side = app.root.children[2];
        const from = front.getPosition().clone(),
            to = back.getPosition().clone();
        camera.setView('back');
        assert.ok(back.getPosition().equals(from), 'switch must start at the visible pose');
        app.fire('update', 0.4);
        assert.ok(!back.getPosition().equals(from));
        assert.ok(!back.getPosition().equals(to));
        assert.ok(back.getPosition().distance({ x: 0, y: 9.5, z: 0 }) > 20, 'orbit must not cut through the house');
        const middle = back.getPosition().clone();
        camera.setView('side');
        assert.ok(side.getPosition().equals(middle), 'rapid clicks must not jump');
        app.fire('update', 0.8);
        assert.equal(side.camera.calculateProjection, null, 'restore native endpoint projection');
        assert.deepEqual(
            app.root.children.map((e) => e.enabled),
            [false, false, true]
        );
    } finally {
        camera.destroy();
        app.destroy();
    }
});

test('screen picking restores projected ground points across views, elevations and lens transitions', () => {
    const app = createApp();
    const camera = createCameraController(
        app,
        [
            {
                id: 'perspective',
                label: 'Perspective',
                projection: 'perspective',
                direction: { x: 0.34, y: 0.84, z: 0.94 }
            },
            { id: 'orthographic', label: 'Orthographic', direction: { x: -1, y: 0.84, z: 0 } }
        ],
        { duration: 0.8 }
    );
    try {
        const check = () => {
            for (const point of [
                { x: 1500, y: 0, z: 2500 },
                { x: -2000, y: 300, z: -1000 }
            ]) {
                const projected = camera.project(point);
                assert.equal(projected.visible, true);
                const restored = camera.screenToGround(projected.x, projected.y, point.y);
                assert.ok(restored);
                for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(restored[axis] - point[axis]) < 1e-6);
            }
        };
        for (const viewport of [
            { width: 1000, height: 700 },
            { width: 500, height: 900 }
        ]) {
            camera.fit({ min: { x: -10000, y: 0, z: -10000 }, max: { x: 10000, y: 8000, z: 10000 } }, viewport);
            check();
            camera.setView('orthographic');
            app.fire('update', 0.4);
            check();
            app.fire('update', 0.4);
            check();
            camera.setView('perspective');
            app.fire('update', 0.8);
        }
        assert.equal(camera.screenToGround(-1, 0), undefined);
        assert.equal(camera.screenToGround(NaN, 0), undefined);
    } finally {
        camera.destroy();
        app.destroy();
    }
});
