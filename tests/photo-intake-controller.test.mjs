/* eslint-disable @typescript-eslint/no-empty-function -- the fake DOM below is made of no-op stubs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// A permissive fake DOM: enough for the intake controller to build its sidebar without a browser.
function fakeElement(tag = 'div') {
    const element = {
        tagName: tag.toUpperCase(),
        children: [],
        style: {},
        dataset: {},
        hidden: false,
        disabled: false,
        value: '',
        textContent: '',
        innerHTML: '',
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        append(...nodes) { element.children.push(...nodes); },
        before() {},
        remove() {},
        replaceChildren(...nodes) { element.children = nodes; },
        setAttribute() {},
        getAttribute: () => null,
        removeAttribute() {},
        toggleAttribute() {},
        addEventListener() {},
        removeEventListener() {},
        querySelector: () => fakeElement(),
        querySelectorAll: () => [],
        closest: () => null,
        focus() {},
        select() {},
        click() {},
        showModal() {},
        close() {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
        get childElementCount() { return element.children.length; }
    };
    return element;
}

function installDom(search = '') {
    const saved = { document: globalThis.document, window: globalThis.window };
    globalThis.document = { createElement: fakeElement, querySelector: () => fakeElement(), querySelectorAll: () => [] };
    globalThis.window = {
        location: { search, href: `http://localhost/${search}` },
        history: { replaceState() {}, pushState() {} },
        matchMedia: () => ({ matches: true }),
        devicePixelRatio: 1
    };
    return () => Object.assign(globalThis, saved);
}

test('photo intake re-applies the site dimension state when it opens and when Dimensions changes', async () => {
    const restore = installDom();
    try {
        const { createPhotoIntake } = await import('../src/photo-intake/controller.ts');
        let openListener;
        let siteSyncs = 0;
        const intake = createPhotoIntake({
            projectId: 'p-0001',
            app: { on() {}, off() {}, graphicsDevice: {} },
            viewport: fakeElement(),
            panelHost: fakeElement(),
            status: fakeElement(),
            panel: {
                onPhotoIntake(listener) { openListener = listener; return () => {}; },
                setGenerating() {},
                async refreshTypologies() {}
            },
            camera: { project: () => ({ x: 0, y: 0, visible: false }), onMove: () => () => {} },
            signal: new AbortController().signal,
            isDisposed: () => false,
            syncSiteDimensions: () => { siteSyncs++; },
            scene: {
                async switchTypology() {},
                whenSwitched: () => Promise.resolve(),
                setHouseVisible: () => Promise.resolve(),
                house: () => ({}),
                renderPreview() {}
            }
        });
        intake.setDimensionsVisible(false);
        assert.equal(siteSyncs, 1, 'toggling Dimensions syncs the site labels');
        openListener(null); // New from photo: opening intake resets open site-label editors
        assert.equal(siteSyncs, 2, 'opening intake syncs the site labels');
        intake.destroy();
    } finally {
        restore();
    }
});

// Deep link /?project=<pid>&photo=<mid>: the photo model's build must replace whatever house is
// shown, but Edit on the card already shown must not re-switch (that would drop placed products).
const BASE = '/data/projects/p-0001/typologies/house-001/';
const fairyScene = JSON.parse(readFileSync(new URL('../public/scenes/typology/fairy-house/scene.json', import.meta.url)));
const modelScene = { ...fairyScene, id: 'house-001', name: 'Photo house' };
const summary = {
    id: 'house-001', name: 'Photo house', facadeSide: 'back', photos: [],
    width: { widthMm: null, source: null, skipped: false }, latestBuild: 2, buildDir: 'builds/v2',
    status: { state: 'submitted', note: '' }, issues: [], job: null, lastStep: null,
    typology: { id: 'house-001', name: 'Photo house', buildVersion: 2 }
};

async function openDeepLink(prepare) {
    const restore = installDom('?project=p-0001&photo=house-001');
    const savedFetch = globalThis.fetch;
    const fetched = [];
    const switched = [];
    const { activeTypology, defaultTypology, parseTypology, setActiveTypology } = await import('../src/typology/index.ts');
    globalThis.fetch = async (input) => {
        const url = String(input);
        fetched.push(url);
        const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
        if (url === '/api/projects/p-0001/photo-models/house-001') return reply({ ok: true, result: summary });
        if (url === '/api/projects/p-0001/typologies') return reply({ ok: true, result: { typologies: [
            { id: 'house-001', projectId: 'house-001', name: 'Photo house', baseUrl: BASE, buildVersion: 2 }] } });
        if (url === `${BASE}scene.json`) return reply(modelScene);
        return reply({ detail: 'Not Found' }, 404); // annotations.json: none, so the layer stays empty
    };
    prepare({ parseTypology, setActiveTypology });
    let intake;
    try {
        const { createPhotoIntake } = await import('../src/photo-intake/controller.ts');
        intake = createPhotoIntake({
            projectId: 'p-0001',
            app: { on() {}, off() {}, graphicsDevice: {} },
            viewport: fakeElement(),
            panelHost: fakeElement(),
            status: fakeElement(),
            panel: { onPhotoIntake: () => () => {}, setGenerating() {}, async refreshTypologies() {} },
            camera: { project: () => ({ x: 0, y: 0, visible: false }), onMove: () => () => {} },
            signal: new AbortController().signal,
            isDisposed: () => false,
            syncSiteDimensions() {},
            scene: {
                async switchTypology(entry, supplied) { switched.push(entry.id); setActiveTypology(supplied); },
                whenSwitched: () => Promise.resolve(),
                setHouseVisible: () => Promise.resolve(),
                house: () => ({}),
                renderPreview() {}
            }
        });
        for (let i = 0; i < 200 && !fetched.some(url => url.endsWith('annotations.json')); i++) await new Promise(resolve => setTimeout(resolve, 5));
        return { fetched, switched, active: activeTypology().id };
    } finally {
        intake?.destroy();
        globalThis.fetch = savedFetch;
        setActiveTypology(defaultTypology);
        restore();
    }
}

test('a photo deep link switches the model in and reads its annotations when another house is shown', async () => {
    const { fetched, switched, active } = await openDeepLink(() => {}); // Fairy is active
    assert.deepEqual(switched, ['house-001'], 'the photo model replaces the shown house');
    assert.equal(active, 'house-001');
    assert.deepEqual(fetched.filter(url => url.endsWith('annotations.json')), [`${BASE}annotations.json`]);
});

test('opening the photo model already shown does not switch the house again', async () => {
    const { fetched, switched } = await openDeepLink(({ parseTypology, setActiveTypology }) =>
        setActiveTypology(parseTypology(modelScene, BASE, 'photo')));
    assert.deepEqual(switched, [], 'no re-switch, so placed products are kept');
    assert.deepEqual(fetched.filter(url => url.endsWith('annotations.json')), [`${BASE}annotations.json`]);
});

test('Back to site setup asks the scene to leave a preview build, with or without a photo model id', async () => {
    const restore = installDom();
    let back;
    const exit = fakeElement();
    exit.before = (node) => { back = node; };
    globalThis.document.querySelector = (selector) => selector === '#product-edit-exit' ? exit : fakeElement();
    try {
        const { createPhotoIntake } = await import('../src/photo-intake/controller.ts');
        let openListener;
        let left = 0;
        const intake = createPhotoIntake({
            projectId: 'p-0001',
            app: { on() {}, off() {}, graphicsDevice: {} },
            viewport: fakeElement(),
            panelHost: fakeElement(),
            status: fakeElement(),
            panel: { onPhotoIntake(listener) { openListener = listener; return () => {}; }, setGenerating() {}, async refreshTypologies() {} },
            camera: { project: () => ({ x: 0, y: 0, visible: false }), onMove: () => () => {} },
            signal: new AbortController().signal,
            isDisposed: () => false,
            syncSiteDimensions() {},
            scene: {
                async switchTypology() {},
                async leavePreview() { left++; },
                whenSwitched: () => Promise.resolve(),
                setHouseVisible: () => Promise.resolve(),
                house: () => ({}),
                renderPreview() {}
            }
        });
        openListener(null);
        await new Promise(resolve => setTimeout(resolve, 10));
        back.onclick();
        for (let i = 0; i < 50 && left === 0; i++) await new Promise(resolve => setTimeout(resolve, 5));
        assert.equal(left, 1, 'closing intake returns the scene to the saved house');
        intake.destroy();
    } finally {
        restore();
    }
});
