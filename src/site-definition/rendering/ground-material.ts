import { ADDRESS_REPEAT, Color, Entity, StandardMaterial, Texture } from 'playcanvas';
import type { AppBase, Material, MeshInstance } from 'playcanvas';

import type { Bounds3 } from '../../shared/geometry/types.ts';
import { loadPbrMaterial } from '../materials/index.ts';

import { daylightConfig } from './config.ts';

/** Swap the actual yard materials, with UVs anchored in world millimeters. */
export function createSiteGrass(app: AppBase) {
    const abort = new AbortController();
    let visible = false;
    let disposed = false;
    let asset: Awaited<ReturnType<typeof loadPbrMaterial>> | undefined;
    let softenedTexture: Texture | undefined;
    const yards = new Map<Entity, { originals: Map<MeshInstance, Material>; material: StandardMaterial }>();
    const configure = (entity: Entity, material: StandardMaterial) => {
        if (!asset) return;
        const size = entity.getLocalScale(), center = entity.getPosition();
        const tileX = asset.manifest.tileMeters[0] * 1000, tileZ = asset.manifest.tileMeters[1] * 1000;
        for (const map of ['diffuse', 'normal', 'gloss', 'ao', 'metalness'] as const) {
            material[`${map}MapTiling`].set(size.x / tileX, size.z / tileZ);
            material[`${map}MapOffset`].set((center.x - size.x / 2) / tileX, (center.z - size.z / 2) / tileZ);
        }
        // Muted gray-green base with only a small contribution from the source grass detail.
        material.useLighting = true;
        material.useTonemap = false;
        material.diffuse = new Color(1, 1, 1);
        material.emissive = new Color(0, 0, 0);
        material.emissiveMap = null;
        material.bumpiness = 0.015;
        material.aoIntensity = 0;
        material.gloss = 0;
        material.glossMap = null;
        material.useMetalness = false;
        material.specular = new Color(0, 0, 0);
        material.update();
    };
    const sync = () => {
        if (disposed) return;
        for (const side of ['back', 'left', 'right']) {
            const entity = app.root.findByName(`${side} yard`);
            if (!(entity instanceof Entity) || !entity.render) continue;
            let entry = yards.get(entity);
            if (!entry) {
                const material = asset ? asset.material.clone() : new StandardMaterial();
                if (!asset) { material.diffuse = new Color().fromString('#bec9a6'); material.gloss = 0; material.update(); }
                entry = { originals: new Map(entity.render.meshInstances.map(mesh => [mesh, mesh.material])), material };
                yards.set(entity, entry);
            }
            configure(entity, entry.material);
            for (const [mesh, original] of entry.originals) mesh.material = visible ? entry.material : original;
        }
    };
    const ready = loadPbrMaterial(app.graphicsDevice, daylightConfig.groundMaterial.manifest, daylightConfig.groundMaterial.profile, abort.signal)
        .then(loaded => {
            if (disposed) { loaded.destroy(); return; }
            asset = loaded;
            const source = loaded.material.diffuseMap!.getSource() as CanvasImageSource;
            const canvas = document.createElement('canvas');
            canvas.width = loaded.material.diffuseMap!.width;
            canvas.height = loaded.material.diffuseMap!.height;
            const context = canvas.getContext('2d')!;
            context.drawImage(source, 0, 0, canvas.width, canvas.height);
            // Match the pale gray-green watercolor swatch; retain just 6% of grass detail.
            context.fillStyle = 'rgba(190, 201, 166, 0.94)';
            context.fillRect(0, 0, canvas.width, canvas.height);
            softenedTexture = new Texture(app.graphicsDevice, {
                name: 'Low contrast site grass', srgb: true, mipmaps: true,
                addressU: ADDRESS_REPEAT, addressV: ADDRESS_REPEAT,
                anisotropy: Math.min(4, app.graphicsDevice.maxAnisotropy)
            });
            softenedTexture.setSource(canvas);
            loaded.material.diffuseMap = softenedTexture;
            for (const entry of yards.values()) {
                const previous = entry.material;
                entry.material = loaded.material.clone();
                for (const [mesh, original] of entry.originals) mesh.material = visible ? entry.material : original;
                previous.destroy();
            }
            sync();
        })
        .catch(error => { if (!disposed) console.warn('Site grass texture unavailable; using green yard material.', error); });
    return {
        ready,
        setVisible(value: boolean) { visible = value; sync(); },
        updateBounds(_bounds: Bounds3) { sync(); },
        destroy() {
            disposed = true; abort.abort();
            for (const entry of yards.values()) {
                for (const [mesh, original] of entry.originals) mesh.material = original;
                entry.material.destroy();
            }
            yards.clear(); asset?.destroy(); softenedTexture?.destroy();
        }
    };
}
