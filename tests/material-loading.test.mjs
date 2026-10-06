import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { NullGraphicsDevice } from 'playcanvas';

import { loadPbrMaterial } from '../src/site-definition/materials/load.ts';

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
