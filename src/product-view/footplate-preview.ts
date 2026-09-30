import { Entity } from 'playcanvas';
import type { AppBase, ContainerResource } from 'playcanvas';

import { loadContainer } from '../house/asset-loader.ts';

export async function loadFootplatePreview(
    app: AppBase,
    signal: AbortSignal
) {
    const url = '/models/varenda/footplate.glb';
    const asset = await loadContainer(app.assets, url, signal).catch(
        (error: unknown) => {
            if (signal.aborted) throw error;
            throw new Error(`Cannot load ${url}`, { cause: error });
        }
    );

    signal.throwIfAborted();

    const root = new Entity('Footplate preview');

    try {
        const model = (
            asset.resource as ContainerResource
        ).instantiateRenderEntity();

        root.addChild(model);
        app.root.addChild(root);

        model.forEach((node) => {
            if (!(node instanceof Entity) || !node.render) return;

            const meshes = node.render.meshInstances;
            if (!meshes.length) return;

            const bounds = meshes[0].aabb.clone();

            for (const mesh of meshes.slice(1)) {
                bounds.add(mesh.aabb);
            }

            console.log(node.name, {
                x: bounds.halfExtents.x * 2,
                y: bounds.halfExtents.y * 2,
                z: bounds.halfExtents.z * 2
            });
        });
    } catch (error) {
        root.destroy();
        asset.unload();
        app.assets.remove(asset);
        throw error;
    }

    let destroyed = false;

    return {
        entity: root,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            root.destroy();
            asset.unload();
            app.assets.remove(asset);
        }
    };
}