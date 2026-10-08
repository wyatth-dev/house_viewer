/* eslint-disable @typescript-eslint/no-empty-function -- the fake DOM below is made of no-op stubs */
import assert from 'node:assert/strict';
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

function installDom() {
    const saved = { document: globalThis.document, window: globalThis.window };
    globalThis.document = { createElement: fakeElement, querySelector: () => fakeElement(), querySelectorAll: () => [] };
    globalThis.window = {
        location: { search: '', href: 'http://localhost/' },
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
