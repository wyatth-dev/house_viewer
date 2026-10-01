import assert from 'node:assert/strict';
import test from 'node:test';

import { Entity } from 'playcanvas';

import { createProductAssetStore, loadContainer } from '../src/product-view/assets.ts';
import { createVarendaView } from '../src/product-view/varenda-view.ts';

test('asset store shares loads and releases once after disposal', async () => {
    let loads = 0,
        unloads = 0,
        removes = 0;
    const resource = {};
    const app = {
        assets: {
            loadFromUrl(url, type, done) {
                loads++;
                done(null, {
                    resource,
                    unload() {
                        unloads++;
                    }
                });
            },
            remove() {
                removes++;
            }
        }
    };
    const store = createProductAssetStore(app, new AbortController().signal);
    assert.equal(await store.load('profile.glb'), resource);
    assert.equal(await store.load('profile.glb'), resource);
    assert.equal(loads, 1);
    store.destroy();
    store.destroy();
    assert.equal(unloads, 1);
    assert.equal(removes, 1);
    await assert.rejects(store.load('other.glb'), { name: 'AbortError' });
});

test('container errors identify requested asset and cancellation rejects promptly', async () => {
    await assert.rejects(
        loadContainer(
            {
                loadFromUrl(u, t, cb) {
                    cb('missing');
                }
            },
            'gutter.glb',
            new AbortController().signal
        ),
        /gutter.glb/
    );
    const abort = new AbortController();
    const pending = loadContainer({ loadFromUrl() { /* Intentionally pending until cancellation. */ } }, 'post.glb', abort.signal);
    abort.abort();
    await assert.rejects(pending, { name: 'AbortError' });
});

test('product view keeps local geometry and independent roots without accumulating parts', async () => {
    const app = { root: new Entity('scene') };
    const resources = { load: async () => ({ instantiateRenderEntity: () => new Entity('mesh') }) };
    const first = await createVarendaView(app, resources);
    const second = await createVarendaView(app, resources);
    const solution = {
        footings: { assemblies: [{ instanceId: 'foot-1', positionMm: { x: 100, y: -2000, z: 0 } }] },
        posts: [{ instanceId: 'post-1', positionMm: { x: 100, y: -2000, z: 5 }, lengthMm: 1595 }],
        gutter: { positionMm: { x: 2000, y: -2000, z: 1600 }, lengthMm: 4000 }
    };
    first.update(solution);
    first.update(solution);
    second.update(solution);
    assert.equal(first.root.children.length, 1);
    const parts = first.root.children[0].children;
    assert.equal(parts.length, 4);
    assert.deepEqual(parts[1].getLocalPosition().toArray(), [100, 5, 2000]);
    assert.equal(parts[1].getLocalScale().y, 1595 / 95);
    for (const gutter of parts.slice(2)) {
        assert.deepEqual(gutter.getLocalPosition().toArray(), [2000, 1600, 2000]);
        assert.deepEqual(gutter.getLocalScale().toArray(), [40, 1, 1]);
    }
    first.destroy();
    first.destroy();
    assert.equal(second.root.children[0].children.length, 4);
    second.destroy();
    app.root.destroy();
});
