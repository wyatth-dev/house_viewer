import { Entity } from 'playcanvas';
import type { AppBase, BoundingBox, ContainerResource } from 'playcanvas';

import type { Bounds3 } from '../geometry/types.ts';

import { loadContainer } from './asset-loader.ts';
import { houseConfig } from './house-config.ts';
export async function loadHouse(app: AppBase, signal: AbortSignal) {
    const { actualWidthMeters, sourceFootprint: source } = houseConfig;
    if (!actualWidthMeters || actualWidthMeters <= 0)
        throw new Error('Confirm the house width in meters to finish model calibration.');
    const asset = await loadContainer(app.assets, houseConfig.url, signal);
    signal.throwIfAborted();
    const house = new Entity('House');
    const model = (asset.resource as ContainerResource).instantiateRenderEntity();
    house.addChild(model);
    const scale = actualWidthMeters / (source.maxX - source.minX);
    house.setLocalScale(scale, scale, scale);
    house.setEulerAngles(0, houseConfig.yawDegrees, 0);
    house.setPosition(
        (-(source.minX + source.maxX) * scale) / 2,
        -houseConfig.groundY * scale,
        (-(source.minZ + source.maxZ) * scale) / 2
    );
    app.root.addChild(house);
    let bounds: BoundingBox | undefined;
    house.forEach((node) => {
        if (node instanceof Entity && node.render)
            for (const mesh of node.render.meshInstances) {
                if (bounds) bounds.add(mesh.aabb);
                else bounds = mesh.aabb.clone();
            }
    });
    if (!bounds) {
        house.destroy();
        asset.unload();
        app.assets.remove(asset);
        throw new Error('The model contains no renderable meshes.');
    }
    const min = bounds.getMin(),
        max = bounds.getMax();
    const renderBounds: Bounds3 = { min: { x: min.x, y: min.y, z: min.z }, max: { x: max.x, y: max.y, z: max.z } };
    return {
        entity: house,
        footprint: { width: actualWidthMeters, depth: (source.maxZ - source.minZ) * scale },
        bounds: renderBounds,
        destroy() {
            house.destroy();
            asset.unload();
            app.assets.remove(asset);
        }
    };
}
