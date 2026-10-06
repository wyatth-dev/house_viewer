import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AppBase, AppOptions, CameraComponentSystem, NullGraphicsDevice, RenderComponentSystem } from 'playcanvas';

import { createCameraController } from '../src/shared/camera/index.ts';
import * as cameraModule from '../src/shared/camera/index.ts';
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
test('canvas mouse controls rotate and zoom, ignore other buttons and browser zoom, and release listeners', () => {
    const app = createApp();
    const camera = createCameraController(app, [{ id: 'a', label: 'A', projection: 'perspective', direction: { x: 0, y: 1, z: 1 } }]);
    const canvas = new EventTarget();
    canvas.style = { cursor: '' };
    canvas.setPointerCapture = () => { /* No native pointer capture in the headless test. */ };
    canvas.releasePointerCapture = () => { /* No native pointer capture in the headless test. */ };
    canvas.hasPointerCapture = () => true;
    canvas.clientHeight = 600;
    const dispatch = (name, values = {}) => {
        const event = Object.assign(new Event(name, { cancelable: true }), { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 10, clientY: 10, ...values });
        canvas.dispatchEvent(event);
        return event;
    };
    let controls;
    try {
        camera.fit({ min: { x: -1000, y: 0, z: -1000 }, max: { x: 1000, y: 2000, z: 1000 } }, { width: 800, height: 600 });
        controls = cameraModule.createOrbitControls(canvas, camera);
        const entity = app.root.children[0];
        const before = entity.getPosition().clone();
        dispatch('pointerdown', { button: 2 });
        dispatch('pointermove', { clientX: 100 });
        assert.ok(entity.getPosition().equals(before));
        dispatch('pointerdown');
        dispatch('pointermove', { clientX: 12 });
        assert.ok(entity.getPosition().equals(before), 'click jitter must not orbit');
        dispatch('pointermove', { clientX: 100 });
        assert.ok(!entity.getPosition().equals(before));
        dispatch('pointerup', { clientX: 100 });
        assert.equal(canvas.style.cursor, '');
        const orbitPose = entity.getPosition().clone();
        const browserZoom = dispatch('wheel', { deltaY: 100, deltaMode: 0, ctrlKey: true });
        assert.equal(browserZoom.defaultPrevented, false);
        assert.ok(entity.getPosition().equals(orbitPose));
        const wheel = dispatch('wheel', { deltaY: -100, deltaMode: 0 });
        assert.equal(wheel.defaultPrevented, true);
        assert.ok(entity.getPosition().distance({ x: 0, y: 1000, z: 0 }) < orbitPose.distance({ x: 0, y: 1000, z: 0 }));
        controls.destroy();
        const stopped = entity.getPosition().clone();
        dispatch('wheel', { deltaY: 100, deltaMode: 0 });
        dispatch('pointerdown');
        dispatch('pointermove', { clientX: 200 });
        assert.ok(entity.getPosition().equals(stopped));
    } finally { controls?.destroy(); camera.destroy(); app.destroy(); }
});
test('manual orbit and zoom preserve the focused target and projected picking in both lenses', () => {
    const app = createApp();
    const camera = createCameraController(app, [
        { id: 'perspective', label: 'Perspective', projection: 'perspective', direction: { x: 0.3, y: 0.8, z: 1 } },
        { id: 'orthographic', label: 'Orthographic', direction: { x: 1, y: 0.8, z: 0 } }
    ], { duration: 0 });
    const viewport = { width: 1000, height: 800 };
    try {
        for (const bounds of [
            { min: { x: -20000, y: 0, z: -30000 }, max: { x: 20000, y: 8000, z: 30000 } },
            { min: { x: 1000, y: 0, z: 25000 }, max: { x: 5000, y: 2500, z: 27000 } }
        ]) {
            const center = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (bounds.min[axis] + bounds.max[axis]) / 2]));
            for (const id of ['perspective', 'orthographic']) {
                camera.setView(id);
                camera.fit(bounds, viewport);
                const entity = app.root.children.find(e => e.enabled);
                const before = entity.getPosition().clone();
                camera.orbit(0.4, 0.1);
                assert.ok(!entity.getPosition().equals(before));
                assert.ok(Math.abs(entity.getPosition().distance(center) - before.distance(center)) < 0.01);
                const projected = camera.project(center);
                assert.ok(Math.abs(projected.x - 500) < 1e-6 && Math.abs(projected.y - 400) < 1e-6);
                const height = entity.camera.orthoHeight;
                const distance = entity.getPosition().distance(center);
                camera.zoom(0.5);
                if (id === 'perspective') assert.ok(entity.getPosition().distance(center) < distance);
                else assert.ok(entity.camera.orthoHeight < height);
                const point = { x: center.x + 100, y: 0, z: center.z + 100 };
                const screen = camera.project(point);
                const restored = camera.screenToGround(screen.x, screen.y, 0);
                assert.ok(restored);
                for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(restored[axis] - point[axis]) < 1e-6);
            }
        }
    } finally { camera.destroy(); app.destroy(); }
});

test('manual input interrupts view animation and notifies labels without later snapping back', () => {
    const app = createApp();
    const camera = createCameraController(app, [
        { id: 'a', label: 'A', projection: 'perspective', direction: { x: 0, y: 1, z: 1 } },
        { id: 'b', label: 'B', direction: { x: 1, y: 1, z: 0 } }
    ]);
    try {
        camera.fit({ min: { x: -1000, y: 0, z: -1000 }, max: { x: 1000, y: 2000, z: 1000 } }, { width: 800, height: 600 });
        camera.setView('b');
        app.fire('update', 0.4);
        let changes = 0;
        camera.onMove(() => changes++);
        camera.orbit(0.2, 0);
        camera.zoom(0.9);
        const entity = app.root.children.find(e => e.enabled);
        const pose = entity.getPosition().clone();
        app.fire('update', 1);
        assert.ok(entity.getPosition().equals(pose));
        assert.equal(changes, 2);
        camera.setView('b');
        app.fire('update', 1);
        assert.equal(entity.camera.calculateProjection, null);
    } finally { camera.destroy(); app.destroy(); }
});
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
                style: {},
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
        site.setVisible(false);
        assert.equal(root.enabled, false);
        site.setDimensions({ front: 1000, back: 0, left: 0, right: 0 });
        assert.equal(root.enabled, false, 'layout updates must not reveal an isolated site');
        site.setVisible(true);
        assert.equal(root.enabled, true);
        assert.equal(root.children.filter((entity) => entity.enabled).length, 1);
        site.setDimensions({ front: 0, back: 0, left: 0, right: 0 });
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

test('product focus and overview animate from the rendered pose and can retarget into a view change', () => {
    const app = createApp();
    const camera = createCameraController(
        app,
        [
            { id: 'front', label: 'Front', projection: 'perspective', direction: { x: 0.3, y: 0.8, z: 1 } },
            { id: 'back', label: 'Back', projection: 'perspective', direction: { x: -0.3, y: 0.8, z: -1 } }
        ],
        { duration: 0.8 }
    );
    const sceneBounds = { min: { x: -20000, y: 0, z: -30000 }, max: { x: 20000, y: 8000, z: 30000 } };
    const productBounds = { min: { x: 1000, y: 0, z: 25000 }, max: { x: 5000, y: 2500, z: 27000 } };
    const viewport = { width: 1000, height: 800 };
    try {
        camera.fit(sceneBounds, viewport);
        const front = app.root.children[0],
            back = app.root.children[1];
        const initial = front.getPosition().clone();
        camera.fit(productBounds, viewport, true);
        assert.ok(front.getPosition().equals(initial), 'focus starts at the displayed camera pose');
        app.fire('update', 0.4);
        const middle = front.getPosition().clone();
        assert.ok(!middle.equals(initial));
        camera.setView('back');
        assert.ok(back.getPosition().equals(middle), 'perspective switch retargets without a jump');
        app.fire('update', 0.8);
        const focused = back.getPosition().clone();
        camera.fit(sceneBounds, viewport, true);
        assert.ok(back.getPosition().equals(focused));
        app.fire('update', 0.1);
        assert.ok(!back.getPosition().equals(focused));
        assert.ok(
            back.getPosition().distance(focused) < focused.distance(initial) / 2,
            'overview must not jump to its full framing on the first frame'
        );
        app.fire('update', 0.8);
        assert.equal(back.camera.calculateProjection, null);
    } finally {
        camera.destroy();
        app.destroy();
    }
});

 test('camera presets follow a rotated component basis and restore world directions for overview', () => {
    const app = createApp();
    const c = createCameraController(app, [
        { id: 'front', label: 'Front', direction: { x: 0, y: 1, z: 1 } },
        { id: 'right', label: 'Right', direction: { x: 1, y: 1, z: 0 } }
    ], { duration: 0.8 });
    const bounds = { min: { x: 400, y: 0, z: 800 }, max: { x: 600, y: 200, z: 1000 } };
    const size = { width: 800, height: 600 };
    try {
        for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
            const basis = {
                right: { x: Math.cos(angle), y: 0, z: -Math.sin(angle) },
                up: { x: 0, y: 1, z: 0 },
                front: { x: Math.sin(angle), y: 0, z: Math.cos(angle) }
            };
            c.setView('front');
            c.fit(bounds, size, false, basis);
            const front = app.root.children[0].getPosition();
            const dx = front.x - 500, dz = front.z - 900;
            assert.ok(Math.abs(dx * basis.front.z - dz * basis.front.x) < 0.01);
            assert.ok(dx * basis.front.x + dz * basis.front.z > 0);
            c.setView('right');
            app.fire('update', 1);
            const right = app.root.children[1].getPosition();
            assert.ok((right.x - 500) * basis.right.x + (right.z - 900) * basis.right.z > 0);
            assert.ok(Math.abs((right.x - 500) * basis.right.z - (right.z - 900) * basis.right.x) < 0.01);
        }
        c.setView('front');
        c.fit(bounds, size, true);
        app.fire('update', 1);
        assert.ok(Math.abs(app.root.children[0].getPosition().x - 500) < 0.01);
        assert.ok(app.root.children[0].getPosition().z > 900);
    } finally { c.destroy(); app.destroy(); }
});

test('low orbit and repeated wheel zoom keep the camera above the ground without moving its focus', () => {
    const app = createApp();
    const camera = createCameraController(app, [{ id: 'a', label: 'A', projection: 'perspective', direction: { x: 0, y: 1, z: 1 } }], { minimumCameraY: 100 });
    try {
        camera.fit({ min: { x: -1000, y: 0, z: -1000 }, max: { x: 1000, y: 2000, z: 1000 } }, { width: 800, height: 600 });
        for (const factor of [1, 0.1, 10, 10, 0.01]) {
            camera.orbit(0.1, -Math.PI);
            camera.zoom(factor);
            assert.ok(app.root.children[0].getPosition().y >= 100 - 1e-6);
            const focus = camera.project({ x: 0, y: 1000, z: 0 });
            assert.ok(Math.abs(focus.x - 400) < 1e-6);
            assert.ok(Math.abs(focus.y - 300) < 1e-6);
        }
    } finally {
        camera.destroy();
        app.destroy();
    }
});

test('scene camera near clipping stays below ground clearance at low angles and after zoom', async () => {
    const { daylightConfig } = await import('../src/site-definition/rendering/config.ts');
    const app = createApp();
    const camera = createCameraController(app, [{ id: 'a', label: 'A', projection: 'perspective', direction: { x: 0, y: 1, z: 1 } }], { ...daylightConfig.camera, minimumCameraY: 100 });
    try {
        camera.fit({ min: { x: -25000, y: 0, z: -35000 }, max: { x: 25000, y: 20000, z: 35000 } }, { width: 570, height: 880 });
        for (const zoom of [1, 0.8, 2]) {
            camera.orbit(0, -Math.PI);
            camera.zoom(zoom);
            const view = app.root.children[0];
            assert.ok(view.getPosition().y >= 100 - 1e-6);
            assert.ok(view.camera.nearClip <= view.getPosition().y * 0.25 + 1e-6, `near clip ${view.camera.nearClip} cuts foreground at ground-level view`);
        }
    } finally { camera.destroy(); app.destroy(); }
});

test('zooming inside product bounds preserves a usable near plane instead of collapsing depth precision', async () => {
    const { daylightConfig } = await import('../src/site-definition/rendering/config.ts');
    const app = createApp();
    const camera = createCameraController(app, [{ id: 'a', label: 'A', projection: 'perspective', direction: { x: 0, y: 1, z: 1 } }], { ...daylightConfig.camera, minimumCameraY: 100 });
    try {
        camera.fit({ min: { x: -2000, y: 0, z: 0 }, max: { x: 2000, y: 3000, z: 2000 } }, { width: 560, height: 880 });
        camera.zoom(0.1);
        for (let i=0;i<20;i++) {
            camera.orbit(0.05, -0.03);
            assert.ok(app.root.children[0].camera.nearClip >= 10, `near plane ${app.root.children[0].camera.nearClip} loses depth precision when enlarged`);
        }
    } finally { camera.destroy(); app.destroy(); }
});
