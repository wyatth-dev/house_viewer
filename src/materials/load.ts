import { ADDRESS_REPEAT, FILTER_LINEAR, FILTER_LINEAR_MIPMAP_LINEAR, Texture } from 'playcanvas';
import type { GraphicsDevice } from 'playcanvas';

import { mapRoles, parseMaterialManifest } from './manifest.ts';
import type { MapRole, MaterialProfile } from './manifest.ts';
import { createPbrMaterial } from './material.ts';

/** One owned material package: local URLs only, cancelable, no per-frame loading. */
export async function loadPbrMaterial(
    device: GraphicsDevice,
    manifestPath: string,
    profile: MaterialProfile,
    signal: AbortSignal
) {
    const controller = new AbortController();
    const requestSignal = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(30000)]);
    const manifestUrl = new URL(manifestPath, window.location.href);
    const response = await fetch(manifestUrl, { signal: requestSignal });
    if (!response.ok) throw new Error(`Material manifest returned HTTP ${response.status}`);
    const manifest = parseMaterialManifest(await response.json());
    const owned: { texture: Texture; bitmap: ImageBitmap }[] = [];
    const cleanup = () => {
        for (const { texture, bitmap } of owned.splice(0)) {
            texture.destroy();
            bitmap.close();
        }
    };
    try {
        const tasks = mapRoles.map(async (role) => {
            try {
                const map = manifest.profiles[profile].maps[role];
                const result = await fetch(new URL(map.file, manifestUrl), { signal: requestSignal });
                if (!result.ok) throw new Error(`${role} returned HTTP ${result.status}`);
                const bitmap = await createImageBitmap(await result.blob(), {
                    premultiplyAlpha: 'none',
                    colorSpaceConversion: 'none'
                });
                if (requestSignal.aborted || bitmap.width !== map.width || bitmap.height !== map.height) {
                    bitmap.close();
                    requestSignal.throwIfAborted();
                    throw new Error(`${role} dimensions do not match the manifest`);
                }
                let texture: Texture;
                try {
                    texture = new Texture(device, {
                        name: `${manifest.id}/${role}`,
                        width: bitmap.width,
                        height: bitmap.height,
                        srgb: map.colorSpace === 'srgb',
                        mipmaps: true,
                        minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
                        magFilter: FILTER_LINEAR,
                        addressU: ADDRESS_REPEAT,
                        addressV: ADDRESS_REPEAT,
                        anisotropy: Math.min(4, device.maxAnisotropy)
                    });
                } catch (error) {
                    bitmap.close();
                    throw error;
                }
                owned.push({ texture, bitmap });
                // PlayCanvas's own image parser passes ImageBitmap here; its declaration omits it.
                texture.setSource(bitmap as unknown as HTMLImageElement);
                return [role, texture] as const;
            } catch (error) {
                controller.abort();
                throw error;
            }
        });
        const results = await Promise.allSettled(tasks);
        const failed = results.find((result) => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
        requestSignal.throwIfAborted();
        const maps = Object.fromEntries(
            results.map((result) => (result as PromiseFulfilledResult<readonly [MapRole, Texture]>).value)
        ) as Record<MapRole, Texture>;
        const material = createPbrMaterial(manifest, maps);
        return {
            material,
            manifest,
            destroy() {
                material.destroy();
                cleanup();
            }
        };
    } catch (error) {
        cleanup();
        throw error;
    }
}
