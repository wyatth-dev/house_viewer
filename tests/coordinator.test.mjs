import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSceneCoordinator } from '../src/app/scene-controller.ts';
test('view changes and resizing never rebuild the site; invalid dimensions never refit', () => {
    let updates = 0,
        fits = 0,
        labels = 0,
        active = 'front';
    let size;
    const site = {
        setDimensions(v) {
            if (v.front < 0) return { front: 'Invalid' };
            updates++;
            return {};
        },
        getBounds: () => ({ min: { x: -6, y: 0, z: -12 }, max: { x: 7, y: 0, z: 10 } }),
        refreshLabels(project) {
            labels++;
            assert.equal(project({ x: 0, y: 0, z: 0 }).x, active === 'front' ? 10 : 20);
        }
    };
    const camera = {
        fit(bounds, viewport) {
            fits++;
            size = viewport;
            assert.deepEqual(bounds, { min: { x: -6, y: 0, z: -12 }, max: { x: 7, y: 9, z: 10 } });
        },
        setView(id) {
            active = id;
        },
        project() {
            return { x: active === 'front' ? 10 : 20, y: 0, visible: true };
        }
    };
    const coordinator = createSceneCoordinator(site, camera, {
        min: { x: -4, y: 0, z: -5 },
        max: { x: 4, y: 9, z: 5 }
    });
    coordinator.resize({ width: 900, height: 600 });
    assert.equal(fits, 1);
    assert.equal(updates, 0);
    coordinator.setView('back');
    assert.equal(active, 'back');
    assert.equal(fits, 1);
    assert.equal(updates, 0);
    coordinator.setDimensions({ front: -1, back: 7, left: 2, right: 3 });
    assert.equal(fits, 1);
    assert.equal(updates, 0);
    coordinator.setDimensions({ front: 5, back: 7, left: 2, right: 3 });
    assert.equal(fits, 2);
    assert.equal(updates, 1);
    assert.equal(labels, 3);
    assert.deepEqual(size, { width: 900, height: 600 });
});
