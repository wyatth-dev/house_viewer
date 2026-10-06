import { Entity } from 'playcanvas';
import type { AppBase, BoundingBox, ContainerResource } from 'playcanvas';

import { loadContainer } from '../../shared/assets/containers.ts';
import type { Bounds3 } from '../../shared/geometry/types.ts';

import { createHouseEdges } from './edges.ts';
import { houseConfig } from './house-config.ts';
export async function loadHouse(app: AppBase, signal: AbortSignal) {
    const { actualWidthMm, sourceFootprint: source } = houseConfig;
    if (!Number.isFinite(actualWidthMm) || actualWidthMm <= 0)
        throw new Error('Confirm the house width in millimeters to finish model calibration.');
    const asset = await loadContainer(app.assets, houseConfig.url, signal);
    signal.throwIfAborted();
    const house = new Entity('House');
    try {
        const model = (asset.resource as ContainerResource).instantiateRenderEntity();
        house.addChild(model);
        const scale = 1; // Millimeter assets load at their authored size.
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
            throw new Error('The model contains no renderable meshes.');
        }
        const min = bounds.getMin(),
            max = bounds.getMax();
        const renderBounds: Bounds3 = { min: { x: min.x, y: min.y, z: min.z }, max: { x: max.x, y: max.y, z: max.z } };
        const removeEdges = createHouseEdges(app, house);
        let destroyed = false;
        return {
            entity: house,
            footprint: { width: actualWidthMm, depth: (source.maxZ - source.minZ) * scale },
            bounds: renderBounds,
            destroy() {
                if (destroyed) return;
                destroyed = true;
                removeEdges();
                house.destroy();
                asset.unload();
                app.assets.remove(asset);
            }
        };
    } catch (error) {
        house.destroy();
        asset.unload();
        app.assets.remove(asset);
        throw error;
    }
}
