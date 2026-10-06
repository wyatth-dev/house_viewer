import assert from 'node:assert/strict';
import test from 'node:test';

import { AppBase, AppOptions, CameraComponentSystem, CULLFACE_NONE, Entity, NullGraphicsDevice, RenderComponentSystem, StandardMaterial } from 'playcanvas';

import { createPlacementController } from '../src/product-placement/controller.ts';

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
        (visible) => contextVisibility.push(visible)
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
        await run({ app, controller, elements, viewport, pointer, overlay, place, choice, focused, contextVisibility });
    } finally {
        controller.destroy();
        app.destroy();
        globalThis.document = saved.document;
        globalThis.window = saved.window;
    }
}

test('confirmation creates independent products; card edits survive navigation and deleting another instance', async () =>
    fixture(async ({ app, controller, elements, viewport, pointer, overlay, place, choice }) => {
        await place(2500);
        const list = elements.get('product-instance-list');
        assert.equal(list.children.length, 1);
        assert.equal(choice.attributes.get('aria-pressed'), 'false');
        const first = app.root.children.find((entity) => entity.name === 'Varenda');
        const position = first.getPosition().clone();
        viewport.events.get('pointermove')(pointer(10000));
        assert.ok(first.getPosition().equals(position));
        list.children[0].children[0].onclick();
        app.fire('update', 0);
        const widthRoot = overlay.children.find((root) => root.children[0].textContent.startsWith('Width'));
        const [widthButton, widthInput] = widthRoot.children;
        widthButton.onclick();
        widthInput.value = '3';
        widthInput.onkeydown({
            key: 'Enter',
            preventDefault() {
                /* DOM test stub. */
            }
        });
        app.fire('update', 0);
        assert.match(list.children[0].children[0].children[1].children[1].textContent, /3 × 2 m/);
        await place(10000);
        assert.equal(list.children.length, 2);
        controller.setPlacementActive(false);
        controller.setPlacementActive(true);
        assert.equal(list.children.length, 2);
        assert.ok(first.getPosition().equals(position));
        list.children[1].children[0].onclick();
        list.children[1].children[1].children.find((item) => item.title === 'Delete Varenda 2').onclick();
        assert.equal(list.children.length, 1);
        assert.equal(first.parent, app.root);
        assert.match(list.children[0].children[0].children[1].children[1].textContent, /3 × 2 m/);
    }));

test('further editing updates the placed instance and production list without leaving the scene', async () =>
    fixture(async ({ app, controller, elements, place }) => {
        controller.setPlacementActive(true);
        await place(2500);
        const list = elements.get('product-instance-list');
        list.children[0].children[0].onclick();
        list.children[0].children[1].children.find((item) => item.title === 'Edit Varenda 1').onclick();
        const detail = elements.get('placed-product-detail');
        assert.equal(detail.hidden, false);
        assert.equal(elements.get('site-back').hidden, true);
        const fields = elements.get('placed-product-detail-content').children[1].children[0];
        fields.children[2].children[0].value = '1200';
        fields.children[2].children[0].oninput();
        const first = app.root.children.find((entity) => entity.name === 'Varenda');
        assert.equal(first.children[0].children.filter((entity) => entity.name.startsWith('post-column-')).length, 4);
        elements.get('product-edit-exit').onclick();
        assert.equal(detail.hidden, true);
        assert.equal(elements.get('site-back').hidden, false);
        controller.setPlacementActive(false);
        controller.setPlacementActive(true);
        assert.equal(list.children.length, 1);
    }));

test('card selection automatically focuses and toggles back to overview; edit opens the 02 subpage', async () =>
    fixture(async ({ elements, place, focused }) => {
        await place(2500);
        const list = elements.get('product-instance-list');
        assert.equal(list.children[0].children[0].attributes.get('aria-pressed'), 'false');
        list.children[0].children[0].onclick();
        assert.ok(focused.at(-1));
        assert.equal(elements.get('placed-product-detail').hidden, true);
        assert.equal(elements.get('placement-overview').hidden, false);
        assert.equal(list.children[0].children[0].attributes.get('aria-pressed'), 'true');
        const actions = list.children[0].children[1].children;
        assert.equal(actions.length, 2);
        assert.equal(actions[1].className, 'product-icon-button delete-product');
        actions[0].onclick();
        assert.equal(elements.get('placement-overview').hidden, true);
        assert.equal(elements.get('placed-product-detail').hidden, false);
        assert.equal(elements.get('step-heading').textContent, 'STEP 02 / PRODUCT CUSTOMIZATION');
    }));

test('invalid instance dimensions retain the model and cannot overlap another product', async () =>
    fixture(async ({ app, elements, overlay, place }) => {
        await place(2500);
        await place(10000);
        const list = elements.get('product-instance-list');
        list.children[0].children[0].onclick();
        app.fire('update', 0);
        const root = overlay.children.find((entry) => entry.children[0].textContent.startsWith('Width'));
        const [button, input, error] = root.children;
        const first = app.root.children.find((entity) => entity.name === 'Varenda');
        const originalParts = first.children[0];
        button.onclick();
        input.value = '20';
        input.onkeydown({
            key: 'Enter',
            preventDefault() {
                /* DOM test stub. */
            }
        });
        assert.match(error.textContent, /occupied/);
        assert.equal(first.children[0], originalParts);
        input.value = '';
        input.onblur();
        assert.equal(error.textContent, 'Enter a number.');
        assert.equal(first.children[0], originalParts);
    }));

test('detail navigation separates live parameters and lab-style component lists', async () =>
    fixture(async ({ app, elements, place, focused }) => {
        await place(2500);
        const list = elements.get('product-instance-list');
        list.children[0].children[0].onclick();
        list.children[0].children[1].children[0].onclick();
        const content = elements.get('placed-product-detail-content');
        const parameters = content.children[1],
            partsPanel = content.children[2];
        const navigation = elements.get('product-customization-navigation');
        assert.equal(navigation.hidden, false);
        assert.equal(elements.get('product-edit-exit').hidden, false);
        assert.equal(parameters.hidden, false);
        assert.equal(partsPanel.hidden, true);
        const fields = parameters.children[0],
            error = parameters.children[1];
        const first = app.root.children.find((entity) => entity.name === 'Varenda');
        const lastValid = first.children[0];
        const width = fields.children[0].children[0];
        width.value = '';
        width.oninput();
        assert.ok(error.textContent);
        assert.equal(first.children[0], lastValid);
        const beforeResize = focused.length;
        width.value = '8000';
        width.oninput();
        assert.equal(focused.length, beforeResize + 1);
        assert.equal(error.textContent, '');
        assert.notEqual(first.children[0], lastValid);
        assert.match(list.children[0].children[0].children[1].children[1].textContent, /8 × 2 m/);
        elements.get('product-edit-parts').onclick();
        assert.equal(parameters.hidden, true);
        assert.equal(partsPanel.hidden, false);
        const parts = partsPanel.children[1];
        const groupButton = parts.children[0].children[1].children[0];
        groupButton.onclick();
        assert.ok(focused.at(-1));
        elements.get('product-edit-parameters').onclick();
        assert.equal(parameters.hidden, false);
        assert.equal(partsPanel.hidden, true);
        elements.get('product-edit-exit').onclick();
        assert.equal(navigation.hidden, true);
        assert.equal(elements.get('product-edit-exit').hidden, true);
        assert.equal(elements.get('placement-overview').hidden, false);
        assert.ok(focused.at(-1));
        assert.equal(list.children[0].children[0].attributes.get('aria-pressed'), 'true');
    }));

test('confirmation hides dimensions; only card selection focuses the product with its wall dimensions', async () =>
    fixture(async ({ app, elements, overlay, place, focused, controller }) => {
        await place(2500);
        const list = elements.get('product-instance-list');
        assert.equal(list.children[0].children[0].attributes.get('aria-pressed'), 'false');
        assert.ok(overlay.children.every((root) => root.hidden));
        const before = focused.length;
        list.children[0].children[0].onclick();
        app.fire('update', 0);
        assert.equal(focused.length, before + 1);
        const bounds = focused.at(-1);
        assert.ok(bounds.min.x <= -500 && bounds.max.x >= 21500, 'frame includes the complete wall dimension chain');
        assert.ok(bounds.max.z >= 31100, 'frame includes the dimension line beyond the product');
        assert.equal(overlay.children.filter((root) => !root.hidden).length, 3);
        assert.deepEqual(controller.focusBounds(), bounds);
        assert.equal(elements.get('placed-product-detail').hidden, true);
        list.children[0].children[0].onclick();
        app.fire('update', 0);
        assert.ok(overlay.children.every((root) => root.hidden));
        assert.equal(focused.at(-1), undefined);
    }));

test('successful placement dimension edits refocus immediately and invalid edits retain the camera', async () =>
    fixture(async ({ app, elements, overlay, place, focused, controller }) => {
        await place(2500);
        const list = elements.get('product-instance-list');
        list.children[0].children[0].onclick();
        app.fire('update', 0);
        const root = overlay.children.find((entry) => entry.children[0].textContent.startsWith('Width'));
        const [button, input] = root.children;
        for (const value of ['3', '8']) {
            const before = focused.length;
            button.onclick();
            input.value = value;
            input.onkeydown({
                key: 'Enter',
                preventDefault() {
                    /* Editor event stub. */
                }
            });
            assert.equal(focused.length, before + 1);
            assert.deepEqual(focused.at(-1), controller.focusBounds());
            app.fire('update', 0);
            assert.match(root.children[0].textContent, new RegExp(`${value} m`));
        }
        const beforeInvalid = focused.length;
        button.onclick();
        input.value = '100';
        input.onkeydown({
            key: 'Enter',
            preventDefault() {
                /* Editor event stub. */
            }
        });
        assert.equal(focused.length, beforeInvalid);
    }));

test('detail selection hides site context and other products, restoring them on deselect and exit', async () =>
    fixture(async ({ app, elements, place, contextVisibility }) => {
        await place(2500);
        await place(10000);
        const products = app.root.children.filter((entity) => entity.name === 'Varenda');
        const list = elements.get('product-instance-list');
        list.children[0].children[0].onclick();
        list.children[0].children[1].children[0].onclick();
        assert.notEqual(contextVisibility.at(-1), false, 'entering parameter edit keeps site context visible');
        elements.get('product-edit-parts').onclick();
        const partsPanel = elements.get('placed-product-detail-content').children[2];
        const parts = partsPanel.children[1];
        parts.children[0].children[1].children[0].onclick();
        assert.equal(contextVisibility.at(-1), false);
        assert.equal(products[0].enabled, true);
        assert.equal(products[1].enabled, false);
        parts.children[0].children[1].children[0].onclick();
        assert.equal(contextVisibility.at(-1), true);
        assert.equal(products[1].enabled, true);
        parts.children[0].children[1].children[0].onclick();
        assert.equal(contextVisibility.at(-1), false);
        elements.get('product-edit-exit').onclick();
        assert.equal(contextVisibility.at(-1), true);
        assert.equal(products[1].enabled, true);
    }));

test('product edit centers itself and replaces placement clearances with editable product parameters', async () =>
    fixture(async ({ app, elements, overlay, place, focused, controller }) => {
        await place(2500);
        const list = elements.get('product-instance-list');
        list.children[0].children[0].onclick();
        const placementFrame = focused.at(-1);
        list.children[0].children[1].children[0].onclick();
        app.fire('update', 0);
        assert.equal(overlay.children.filter((root) => !root.hidden).length, 6);
        assert.ok(overlay.children.filter((root) => !root.hidden).every((root) => !/clearance/.test(root.children[0].textContent)));
        assert.notDeepEqual(focused.at(-1), placementFrame);
        const position = app.root.children.find((entity) => entity.name === 'Varenda').getPosition();
        assert.equal((focused.at(-1).min.x + focused.at(-1).max.x) / 2, position.x);
        assert.equal((focused.at(-1).min.z + focused.at(-1).max.z) / 2, position.z);
        assert.deepEqual(focused.at(-1), controller.focusBounds());
        elements.get('product-edit-parts').onclick();
        app.fire('update', 0);
        assert.equal(overlay.children.filter((root) => !root.hidden).length, 0);
    }));

test('editor locks preserve selected dimensions and synchronize live width parameters', async () =>
    fixture(async ({ app, elements, overlay, place }) => {
        await place(2500);
        const list = elements.get('product-instance-list');
        list.children[0].children[0].onclick();
        const edit = (label, meters) => {
            app.fire('update', 0);
            const root = overlay.children.find((entry) => !entry.hidden && entry.children[0].textContent.startsWith(label));
            root.children[0].onclick();
            root.children[1].value = String(meters);
            root.children[1].onkeydown({ key: 'Enter', preventDefault() { /* DOM test stub. */ } } );
            app.fire('update', 0);
        };
        const text = (label) => overlay.children.find((entry) => !entry.hidden && entry.children[0].textContent.startsWith(label)).children[0].textContent;
        edit('Left', 1);
        const lock = (label) => {
            overlay.children.find((entry) => !entry.hidden && entry.children[0].textContent.startsWith(label)).children[3].onclick();
            app.fire('update', 0);
        };
        lock('Left');
        edit('Right', 15);
        assert.match(text('Left'), /1 m/);
        list.children[0].children[1].children[0].onclick();
        let width = elements.get('placed-product-detail-content').children[1].children[0].children[0].children[0];
        assert.equal(width.value, '6000');
        elements.get('product-edit-exit').onclick();
        app.fire('update', 0);
        lock('Left');
        lock('Right');
        list.children[0].children[1].children[0].onclick();
        width = elements.get('placed-product-detail-content').children[1].children[0].children[0].children[0];
        width.value = '5000';
        width.oninput();
        app.fire('update', 0);
        elements.get('product-edit-exit').onclick();
        app.fire('update', 0);
        assert.match(text('Right'), /15 m/);
        assert.match(text('Left'), /2 m/);
        lock('Right');
        lock('Width');

        edit('Right', 14);
        assert.match(text('Width'), /5 m/);
        assert.match(text('Left'), /3 m/);
    }));

test('dimension locks belong to each product and persist across editor navigation', async () =>
    fixture(async ({ app, elements, overlay, place }) => {
        await place(2500);
        const list = elements.get('product-instance-list');
        const width = () => overlay.children.find((entry) => entry.children[0].textContent.startsWith('Width'));
        list.children[0].children[0].onclick();
        app.fire('update', 0);
        width().children[3].onclick();
        assert.equal(width().children[0].disabled, true);
        list.children[0].children[1].children[0].onclick();
        elements.get('product-edit-exit').onclick();
        await place(10000);
        list.children[1].children[0].onclick();
        app.fire('update', 0);
        assert.equal(width().children[0].disabled, false);
        list.children[0].children[0].onclick();
        app.fire('update', 0);
        assert.equal(width().children[0].disabled, true);
        width().children[3].onclick();
        assert.equal(width().children[0].disabled, false);
    }));

test('3D product parameters and sidebar share real-time edits and validation', async () =>
    fixture(async ({ app, elements, overlay, place, focused }) => {
        await place(2500);
        const list = elements.get('product-instance-list');
        list.children[0].children[0].onclick();
        list.children[0].children[1].children[0].onclick();
        app.fire('update', 0);
        const fields = elements.get('placed-product-detail-content').children[1].children[0];
        const annotation = (name) => overlay.children.find((root) => !root.hidden && root.children[0].textContent.startsWith(name));
        const focusAfterSelection = focused.length;
        for (const [index, name, meters] of [[0, 'Width', 3], [1, 'Depth', 1.5], [2, 'Post spacing', 0.8], [3, 'Rafter spacing', 0.4], [4, 'Underside height', 1.7], [5, 'Wall height', 2.7]]) {
            const root = annotation(name);
            root.children[0].onclick();
            root.children[1].value = String(meters);
            root.children[1].onkeydown({ key: 'Enter', preventDefault() { /* DOM test stub. */ } });
            app.fire('update', 0);
            assert.equal(fields.children[index].children[0].value, String(meters * 1000));
            assert.equal(focused.length, focusAfterSelection, 'parameter edits preserve the current camera');
        }
        const depth = fields.children[1].children[0];
        depth.value = '1800';
        depth.oninput();
        app.fire('update', 0);
        assert.match(annotation('Depth').children[0].textContent, /1.8 m/);
        assert.equal(focused.length, focusAfterSelection, 'sidebar edits preserve the current camera');
        annotation('Depth').children[3].onclick();
        assert.equal(depth.disabled, true);
        annotation('Depth').children[3].onclick();
        assert.equal(depth.disabled, false);
        const width = fields.children[0].children[0];
        width.value = '100000';
        width.oninput();
        assert.equal(width.value, '3000');
        width.value = '';
        width.oninput();
        depth.value = '1900';
        depth.oninput();
        assert.equal(depth.value, '1900');
        assert.equal(width.value, '3000');
        width.value = '';
        width.oninput();
        width.onblur();
        assert.equal(width.value, '3000');
        const before = focused.length;
        const root = annotation('Width');
        root.children[0].onclick();
        root.children[1].value = '100';
        root.children[1].onkeydown({ key: 'Enter', preventDefault() { /* DOM test stub. */ } });
        assert.equal(focused.length, before);
        assert.equal(fields.children[0].children[0].value, '3000');
        assert.ok(root.children[2].textContent);
        assert.equal(root.children[1].hidden, true);
        assert.equal(root.children[1].value, '3');
    }));

test('exit edit preserves the selected product, placement dimensions and relative focus', async () =>
    fixture(async ({ app, elements, overlay, place, focused, controller }) => {
        await place(2500);
        const list = elements.get('product-instance-list');
        list.children[0].children[0].onclick();
        const placementBounds = focused.at(-1);
        list.children[0].children[1].children[0].onclick();
        elements.get('product-edit-exit').onclick();
        app.fire('update', 0);
        assert.equal(list.children[0].children[0].attributes.get('aria-pressed'), 'true');
        assert.deepEqual(focused.at(-1), placementBounds);
        assert.deepEqual(controller.focusBounds(), placementBounds);
        assert.equal(overlay.children.filter((root) => !root.hidden).length, 3);
        assert.ok(overlay.children.some((root) => !root.hidden && root.children[0].textContent.startsWith('Left clearance')));
        list.children[0].children[0].onclick();
        app.fire('update', 0);
        assert.equal(focused.at(-1), undefined);
        assert.ok(overlay.children.every((root) => root.hidden));
    }));

test('placement preview remains visible through structures and shows only clearances', async () =>
    fixture(async ({ app, controller, viewport, pointer, overlay, elements }) => {
        controller.toggleProduct('varenda');
        viewport.events.get('pointermove')(pointer(2500));
        await tick();
        app.fire('update', 0);
        const labels = overlay.children.filter((root) => !root.hidden).map((root) => root.children[0].textContent);
        assert.equal(labels.length, 2);
        assert.ok(labels.every((label) => /^\d+(\.\d+)?$/.test(label)));
        for (const root of overlay.children.filter((entry) => !entry.hidden)) {
            assert.equal(root.children[0].disabled, true);
            assert.equal(root.children[3].hidden, true);
            assert.equal(root.style.pointerEvents, 'none');
            root.children[0].onclick();
            assert.equal(root.children[1].hidden, true);
        }
        const preview = app.root.children.find((entity) => entity.name === 'Varenda placement preview');
        const layer = app.scene.layers.getLayerByName('Placement preview');
        assert.ok(layer);
        assert.equal(app.scene.layers.layerList.at(-1), layer);
        assert.ok(app.root.findByName('Test camera').camera.layers.includes(layer.id));
        let meshes = 0;
        preview.forEach((entity) => {
            for (const mesh of entity.render?.meshInstances ?? []) {
                meshes++;
                assert.deepEqual(entity.render.layers, [layer.id]);
                assert.equal(mesh.material.useLighting, false);
                assert.equal(mesh.material.cull, CULLFACE_NONE);
                assert.equal(mesh.material.depthTest, false);
                assert.equal(mesh.material.depthWrite, false);
                assert.equal(mesh.material.opacity, 0.45);
                assert.ok(mesh.material.diffuse.g > 0.8 && mesh.material.diffuse.r < 0.2);
            }
        });
        assert.ok(meshes > 0);
        viewport.events.get('pointerdown')(pointer(2500));
        await viewport.events.get('pointerup')(pointer(2500));
        const product = app.root.children.find((entity) => entity.name === 'Varenda');
        product.forEach((entity) => {
            for (const mesh of entity.render?.meshInstances ?? []) assert.equal(mesh.material.depthTest, true);
        });
        elements.get('product-instance-list').children[0].children[0].onclick();
        app.fire('update', 0);
        assert.equal(overlay.children.filter((root) => !root.hidden).length, 3);
    }, true));
