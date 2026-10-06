import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Entity, NullGraphicsDevice, StandardMaterial } from 'playcanvas';

import { loadPbrMaterial } from '../src/site-definition/materials/load.ts';
import { createSiteGrass } from '../src/site-definition/rendering/ground-material.ts';

const manifest = JSON.parse(
    readFileSync(new URL('../public/site-definition/materials/short-grass/material.json', import.meta.url), 'utf8')
);
test('partial material download failure releases decoded textures and bitmaps', async () => {
    const keys = ['window', 'fetch', 'ImageBitmap', 'HTMLVideoElement', 'createImageBitmap'];
    const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const bitmaps = [];
    class Bitmap {
        width = 1024;
        height = 1024;
        closed = false;
        close() {
            this.closed = true;
        }
    }
    const device = new NullGraphicsDevice({ width: 10, height: 10 });
    const before = device.textures.length;
    let releaseFailure;
    const decoded = new Promise((resolve) => {
        releaseFailure = resolve;
    });
    try {
        globalThis.window = { location: { href: 'http://localhost/' } };
        globalThis.ImageBitmap = Bitmap;
        globalThis.HTMLVideoElement = class {
            videoWidth = 0;
        };
        globalThis.createImageBitmap = async () => {
            const bitmap = new Bitmap();
            bitmaps.push(bitmap);
            releaseFailure();
            return bitmap;
        };
        globalThis.fetch = async (url, { signal }) => {
            signal.throwIfAborted();
            const path = String(url);
            if (path.endsWith('material.json')) return { ok: true, json: async () => structuredClone(manifest) };
            if (path.endsWith('normal.webp')) {
                await decoded;
                return { ok: false, status: 404 };
            }
            return { ok: true, blob: async () => new Blob() };
        };
        await assert.rejects(
            loadPbrMaterial(
                device,
                '/site-definition/materials/short-grass/material.json',
                '1k',
                new AbortController().signal
            )
        );
        assert.ok(bitmaps.length > 0);
        assert.ok(bitmaps.every((bitmap) => bitmap.closed));
        assert.equal(device.textures.length, before);
        const abort = new AbortController();
        abort.abort();
        await assert.rejects(
            loadPbrMaterial(device, '/site-definition/materials/short-grass/material.json', '1k', abort.signal),
            {
                name: 'AbortError'
            }
        );
    } finally {
        device.destroy();
        for (const [key, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});


test('grass mode changes the actual site yards and restores white without changing the front or world', async () => {
    const savedFetch = globalThis.fetch, savedWindow = globalThis.window;
    const device = new NullGraphicsDevice({ width: 10, height: 10 });
    const root = new Entity('Scene');
    const originals = new Map();
    for (const name of ['back yard', 'left yard', 'right yard', 'front yard', 'Environment ground']) {
        const entity = new Entity(name);
        const material = new StandardMaterial();
        Object.defineProperty(entity, 'render', { value: { meshInstances: [{ material }] } });
        root.addChild(entity); originals.set(name, material);
    }
    globalThis.window = { location: { href: 'http://localhost/' } };
    globalThis.fetch = async () => { throw new Error('Test loading fallback'); };
    const previousWarn = console.warn;
    console.warn = () => { /* Expected simulated load failure. */ };
    const grass = createSiteGrass({ root, graphicsDevice: device });
    try {
        grass.updateBounds({ min: { x: -10, y: 0, z: -10 }, max: { x: 10, y: 0, z: 10 } });
        grass.setVisible(true);
        for (const side of ['back', 'left', 'right']) {
            const mesh = root.findByName(`${side} yard`).render.meshInstances[0];
            assert.notEqual(mesh.material, originals.get(`${side} yard`));
            assert.ok(mesh.material.diffuse.g > mesh.material.diffuse.r);
        }
        for (const name of ['front yard', 'Environment ground'])
            assert.equal(root.findByName(name).render.meshInstances[0].material, originals.get(name));
        await grass.ready;
        grass.setVisible(false);
        for (const [name, material] of originals)
            assert.equal(root.findByName(name).render.meshInstances[0].material, material);
        grass.setVisible(true);
        assert.notEqual(root.findByName('back yard').render.meshInstances[0].material, originals.get('back yard'));
    } finally {
        grass.destroy(); root.destroy(); device.destroy();
        console.warn = previousWarn; globalThis.fetch = savedFetch; globalThis.window = savedWindow;
    }
});
