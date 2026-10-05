import assert from 'node:assert/strict';
import test from 'node:test';

import { createDimensionOverlay } from '../src/shared/measurements/dimension-overlay.ts';

function fixture(run, onInteractionChange) {
    const oldDocument = globalThis.document;
    const element = () => ({
        children: [],
        style: {},
        hidden: false,
        value: '',
        offsetWidth: 120,
        offsetHeight: 30,
        append(...items) {
            this.children.push(...items);
        },
        setAttribute() {
            /* DOM/engine stub for this test. */
        },
        removeAttribute() {
            /* DOM/engine stub for this test. */
        },
        remove() {
            this.removed = true;
        },
        focus() {
            /* DOM/engine stub for this test. */
        },
        select() {
            /* DOM/engine stub for this test. */
        },
        get valueAsNumber() {
            return Number(this.value);
        }
    });
    globalThis.document = { createElement: element };
    const app = {
        on() {
            /* DOM/engine stub for this test. */
        },
        off() {
            /* DOM/engine stub for this test. */
        },
        drawLine() {
            /* DOM/engine stub for this test. */
        }
    };
    const host = { ...element(), clientWidth: 800, clientHeight: 600 };
    const view = createDimensionOverlay(app, host, onInteractionChange);
    try {
        run(view, host);
    } finally {
        view.destroy();
        globalThis.document = oldDocument;
    }
}
const annotation = {
    id: 'width',
    label: 'Width',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 4000, y: 0, z: 0 },
    valueMm: 4000
};

test('click editor converts meters to millimeters and commits on Enter', () =>
    fixture((view, host) => {
        let saved;
        view.update([
            {
                ...annotation,
                edit: (value) => {
                    saved = value;
                    view.update([{ ...annotation, valueMm: value, edit: () => undefined }]);
                }
            }
        ]);
        const [button, input] = host.children[0].children;
        button.onclick();
        assert.equal(input.value, '4');
        input.value = '3.5';
        input.onkeydown({
            key: 'Enter',
            preventDefault() {
                /* DOM/engine stub for this test. */
            }
        });
        assert.equal(saved, 3500);
        assert.equal(input.hidden, true);
        assert.match(button.textContent, /3.5 m/);
    }));

test('invalid edits stay open and empty edits never submit', () =>
    fixture((view, host) => {
        let calls = 0;
        view.update([
            {
                ...annotation,
                edit: () => {
                    calls++;
                    return 'Outside the boundary.';
                }
            }
        ]);
        const [button, input, error] = host.children[0].children;
        button.onclick();
        input.value = '50';
        input.onblur();
        assert.equal(input.hidden, false);
        assert.equal(error.textContent, 'Outside the boundary.');
        input.value = '';
        input.onblur();
        assert.equal(calls, 1);
        assert.equal(error.textContent, 'Enter a number.');
    }));

test('Escape cancels without committing and hiding cancels pending edits', () =>
    fixture((view, host) => {
        let calls = 0;
        view.update([
            {
                ...annotation,
                edit: () => {
                    calls++;
                }
            }
        ]);
        view.refresh(() => ({ x: 200, y: 200, visible: true }));
        const root = host.children[0],
            [button, input] = root.children;
        button.onclick();
        input.value = '9';
        input.onkeydown({
            key: 'Escape',
            preventDefault() {
                /* DOM/engine stub for this test. */
            }
        });
        assert.equal(calls, 0);
        assert.equal(input.hidden, true);
        button.onclick();
        view.setVisible(false);
        input.onblur();
        assert.equal(calls, 0);
        assert.equal(root.hidden, true);
        view.setVisible(true);
        assert.equal(root.hidden, false);
        assert.equal(input.hidden, true);
    }));

test('reference distances cannot open an editor', () =>
    fixture((view, host) => {
        view.update([annotation]);
        const [button, input] = host.children[0].children;
        assert.equal(button.disabled, true);
        button.onclick();
        assert.equal(input.hidden, true);
    }));

test('hover and editing keep placement frozen; Escape stops propagation and releases after leaving', () => {
    const interactions = [];
    fixture(
        (view, host) => {
            view.update([{ ...annotation, edit: () => undefined }]);
            const root = host.children[0],
                [button, input] = root.children;
            root.onpointerenter();
            assert.equal(interactions.at(-1), true);
            button.onclick();
            root.onpointerleave();
            assert.equal(interactions.at(-1), true);
            assert.equal(view.isEditing(), true);
            let stopped = false;
            input.onkeydown({
                key: 'Escape',
                preventDefault() {
                    /* DOM test stub. */
                },
                stopPropagation() {
                    stopped = true;
                }
            });
            assert.equal(stopped, true);
            assert.equal(view.isEditing(), false);
            assert.equal(interactions.at(-1), false);
        },
        (active) => interactions.push(active)
    );
});

test('dimension lock toggles independently and blocks editing until unlocked', () =>
    fixture((view, host) => {
        let locked = false;
        const update = () => view.update([{ ...annotation, locked, edit: () => undefined,
            toggleLock: () => { locked = !locked; update(); } }]);
        update();
        const [button, input, , lock] = host.children[0].children;
        assert.ok(lock);
        assert.equal(lock.hidden, false);
        lock.onclick({ stopPropagation() { /* DOM test stub. */ } });
        assert.equal(locked, true);
        assert.equal(button.disabled, true);
        button.onclick();
        assert.equal(input.hidden, true);
        lock.onclick({ stopPropagation() { /* DOM test stub. */ } });
        assert.equal(button.disabled, false);
        button.onclick();
        assert.equal(input.hidden, false);
    }));

test('frame updates keep lock icon nodes stable throughout a pointer click', () =>
    fixture((view, host) => {
        const data = { ...annotation, edit: () => undefined, locked: false,
            toggleLock() { /* DOM test stub. */ } };
        view.update([data]);
        const lock = host.children[0].children[3];
        let writes = 0;
        let markup = lock.innerHTML;
        Object.defineProperty(lock, 'innerHTML', {
            get: () => markup,
            set: (value) => { writes++; markup = value; }
        });
        for (let frame = 0; frame < 10; frame++) view.update([data]);
        assert.equal(writes, 0, 'pointer-down icon must survive until pointer-up');
        view.update([{ ...data, locked: true }]);
        assert.equal(writes, 1);
        view.update([{ ...data, locked: true }]);
        assert.equal(writes, 1);
    }));
