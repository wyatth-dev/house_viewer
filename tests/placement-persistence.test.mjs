import assert from 'node:assert/strict';
import test from 'node:test';

import { AppBase, AppOptions, CameraComponentSystem, Entity, NullGraphicsDevice, RenderComponentSystem, StandardMaterial } from 'playcanvas';

import { createPlacementController } from '../src/product-placement/controller.ts';

// Harness copied (minimally) from placement-controller.test.mjs, whose helpers are not exported.
// Its ElementStub lacks `after`, which the controller now calls; added here.
class ElementStub {
    children = [];
    attributes = new Map();
    events = new Map();
    style = {/* DOM test stub. */};
    hidden = false;
    value = '';
    clientWidth = 1000;
    clientHeight = 800;
    offsetWidth = 140;
    offsetHeight = 30;
    className = '';
    classes = new Set();
    classList = {
        toggle: (name, value) => (value ? this.classes.add(name) : this.classes.delete(name)),
        remove: (name) => this.classes.delete(name)
    };
    append(...items) {
        this.children.push(...items);
        for (const item of items) item.parent = this;
    }
    after(...items) {
        if (!this.parent) return;
        const at = this.parent.children.indexOf(this) + 1;
        this.parent.children.splice(at, 0, ...items);
        for (const item of items) item.parent = this.parent;
    }
    replaceChildren(...items) {
        this.children = [];
        this.append(...items);
    }
    setAttribute(name, value) {
        this.attributes.set(name, value);
    }
    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }
    removeAttribute(name) {
        this.attributes.delete(name);
    }
    remove() {
        if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this);
    }
    addEventListener(name, callback) {
        this.events.set(name, callback);
    }
    removeEventListener(name) {
        this.events.delete(name);
    }
    closest(selector) {
        return selector === '.editable-measurement' && this.className.includes('editable-measurement')
            ? this
            : this.parent?.closest(selector);
    }
    querySelector(selector) {
        if (selector === 'canvas') return this.canvas;
        return this.children.find(
            (child) => selector === '.product-placeholder' && child.className === 'product-placeholder'
        );
    }
    cloneNode() {
        const copy = new ElementStub();
        copy.className = this.className;
        return copy;
    }
    getBoundingClientRect() {
        return { left: 0, top: 0 };
    }
    focus() {
        /* DOM test stub. */
    }
    select() {
        /* DOM test stub. */
    }
    get valueAsNumber() {
        return Number(this.value);
    }
}
const tick = async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
};
async function fixture(run, withMeshes = false) {
    const saved = { document: globalThis.document, window: globalThis.window };
    const elements = new Map(
        [
            'product-instance-list',
            'products-empty',
            'placed-product-detail',
            'placed-product-detail-content',
            'site-back',
            'placement-overview',
            'product-customization-navigation',
            'product-edit-exit',
            'product-edit-parameters',
            'product-edit-parts',
            'step-heading',
            'step-title',
            'step-description'
        ].map((id) => [id, new ElementStub()])
    );
    elements.get('product-customization-navigation').hidden = true;
    elements.get('placed-product-detail').hidden = true;
    globalThis.document = {
        addEventListener() {
            /* DOM test stub. */
        },
        removeEventListener() {
            /* DOM test stub. */
        },
        createElement: () => new ElementStub(),
        createTextNode: (textContent) => ({ textContent }),
        querySelector: (selector) => elements.get(selector.slice(1))
    };
    globalThis.window = {
        matchMedia: () => ({ matches: true }),
        addEventListener() {
            /* DOM test stub. */
        },
        removeEventListener() {
            /* DOM test stub. */
        },
        scrollY: 0,
        scrollTo() {
            /* DOM test stub. */
        }
    };
    const canvas = new ElementStub();
    canvas.id = 'test';
    canvas.width = 1000;
    canvas.height = 800;
    const app = new AppBase(canvas),
        options = new AppOptions();
    options.graphicsDevice = new NullGraphicsDevice(canvas);
    options.componentSystems = [RenderComponentSystem, CameraComponentSystem];
    app.init(options);
    if (withMeshes) {
        const camera = new Entity('Test camera');
        camera.addComponent('camera');
        app.root.addChild(camera);
    }
    app.assets.loadFromUrl = (_url, _type, callback) =>
        callback(null, {
            resource: { instantiateRenderEntity: () => {
                const entity = new Entity('mesh');
                if (withMeshes) entity.addComponent('render', { type: 'box', material: new StandardMaterial() });
                return entity;
            } },
            unload() {
                /* DOM test stub. */
            }
        });
    app.assets.remove = () => {
        /* DOM test stub. */
    };
    const viewport = new ElementStub();
    viewport.canvas = canvas;
    const choice = new ElementStub(),
        icon = new ElementStub();
    icon.className = 'product-placeholder';
    choice.append(icon);
    const overlay = new ElementStub();
    const focused = [];
    const contextVisibility = [];
    const changes = [];
    const controller = createPlacementController(
        app,
        overlay,
        () => ({ minX: -30000, maxX: 30000, minZ: -35000, maxZ: 35000 }),
        () => ({ x: 400, y: 400, visible: true }),
        viewport,
        choice,
        (x) => ({ x, y: 0, z: 29500 }),
        new AbortController().signal,
        (bounds) => focused.push(bounds),
        (visible) => contextVisibility.push(visible),
        undefined,
        () => changes.push(true)
    );
    const pointer = (x) => ({ clientX: x, clientY: 400, pointerType: 'mouse', button: 0, target: canvas });
    const place = async (x) => {
        controller.toggleProduct('varenda');
        viewport.events.get('pointermove')(pointer(x));
        await tick();
        viewport.events.get('pointerdown')(pointer(x));
        await viewport.events.get('pointerup')(pointer(x));
        app.fire('update', 0);
    };
    controller.setPlacementActive(true);
    try {
        await run({ changes, app, controller, elements, viewport, pointer, overlay, place, choice, focused, contextVisibility });
    } finally {
        controller.destroy();
        app.destroy();
        globalThis.document = saved.document;
        globalThis.window = saved.window;
    }
}

const params = (widthMm) => ({ widthMm, depthMm: 2000, wallHeightMm: 2500, undersideHeightMm: 1800, postInterval: 1000, rafterInterval: 500 });
const record = (n, wallFaceId, alongWallOffsetMm, extra = {}) => ({
    instanceId: `varenda-${n}`,
    productType: 'varenda',
    name: `Varenda ${n}`,
    attachment: { wallFaceId, alongWallOffsetMm },
    params: params(4000),
    lockedDimensions: [],
    lockedParameters: [],
    ...extra
});

test('snapshot and restore round-trip products', async () =>
    fixture(async ({ controller, changes, elements }) => {
        const records = [
            record(3, 'right-main', 1000, { lockedDimensions: ['width'], lockedParameters: ['depthMm'] }),
            record(7, 'right-main', 8000, { params: params(3000) })
        ];
        const result = await controller.restore(records);
        assert.deepEqual(result, { restored: 2, skipped: 0 });
        assert.deepEqual(controller.snapshot(), records);
        assert.equal(changes.length, 0);
        assert.equal(elements.get('product-instance-list').children.length, 2);
    }));

test('restore skips products whose wall is missing', async () =>
    fixture(async ({ controller, changes }) => {
        const result = await controller.restore([record(1, 'right-main', 1000), record(2, 'nope', 1000)]);
        assert.deepEqual(result, { restored: 1, skipped: 1 });
        assert.deepEqual(controller.snapshot().map((item) => item.instanceId), ['varenda-1']);
        assert.equal(changes.length, 0);
    }));

test('restore skips products that overlap an already restored product', async () =>
    fixture(async ({ controller }) => {
        const result = await controller.restore([record(1, 'right-main', 1000), record(2, 'right-main', 2000)]);
        assert.deepEqual(result, { restored: 1, skipped: 1 });
    }));

test('placing after restore continues the restored id sequence', async () =>
    fixture(async ({ controller, place, changes }) => {
        await controller.restore([record(7, 'right-main', 1000)]);
        await place(2500);
        const ids = controller.snapshot().map((item) => item.instanceId);
        assert.deepEqual(ids, ['varenda-7', 'varenda-8']);
        assert.equal(changes.length, 1);
    }));

test('deleting a product notifies onChange', async () =>
    fixture(async ({ controller, changes, elements }) => {
        await controller.restore([record(1, 'right-main', 1000)]);
        const list = elements.get('product-instance-list');
        list.children[0].children[0].onclick();
        list.children[0].children[1].children.find((item) => item.title === 'Delete Varenda 1').onclick();
        assert.deepEqual(controller.snapshot(), []);
        assert.equal(changes.length, 1);
    }));
