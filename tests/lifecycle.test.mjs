import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createLifetime } from '../src/app/lifetime.ts';
import { loadContainer } from '../src/house/asset-loader.ts';
test('disposal aborts pending loading before releasing the app and runs once', async () => {
    const life = createLifetime();
    let callback;
    let released = 0;
    const registry = {
        loadFromUrl(url, type, cb) {
            callback = cb;
        }
    };
    const pending = loadContainer(registry, '/house.glb', life.signal);
    life.add(() => {
        assert.equal(life.signal.aborted, true);
        released++;
    });
    life.dispose();
    life.dispose();
    await assert.rejects(pending, { name: 'AbortError' });
    callback(null, { resource: {} });
    assert.equal(released, 1);
    life.add(() => released++);
    assert.equal(released, 2);
});
test('failed asset loading rejects, successful loading resolves, pre-aborted loading never starts', async () => {
    await assert.rejects(
        loadContainer(
            {
                loadFromUrl(u, t, cb) {
                    cb('404');
                }
            },
            '/missing.glb',
            new AbortController().signal
        ),
        /could not be loaded/
    );
    const asset = { resource: {} };
    assert.equal(
        await loadContainer(
            {
                loadFromUrl(u, t, cb) {
                    cb(null, asset);
                }
            },
            '/house.glb',
            new AbortController().signal
        ),
        asset
    );
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
        loadContainer(
            {
                loadFromUrl() {
                    assert.fail('should not start');
                }
            },
            '/house.glb',
            abort.signal
        ),
        { name: 'AbortError' }
    );
});
