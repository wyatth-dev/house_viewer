import type { CameraController } from '../shared/camera/index.ts';
import type { Bounds3, Viewport } from '../shared/geometry/types.ts';

import type { Dimensions, SiteController } from './index.ts';
export function createSceneCoordinator(
    site: SiteController,
    camera: CameraController,
    house: Bounds3,
    contextBounds?: () => Bounds3
) {
    let viewport: Viewport = { width: 1, height: 1 };
    const refresh = () => site.refreshLabels(camera.project);
    const fit = () => {
        const ground = site.getBounds();
        const bounds: Bounds3 = {
            min: {
                x: Math.min(house.min.x, ground.min.x),
                y: Math.min(house.min.y, ground.min.y),
                z: Math.min(house.min.z, ground.min.z)
            },
            max: {
                x: Math.max(house.max.x, ground.max.x),
                y: Math.max(house.max.y, ground.max.y),
                z: Math.max(house.max.z, ground.max.z)
            }
        };
        const context = contextBounds?.();
        if (context)
            for (const axis of ['x', 'y', 'z'] as const) {
                bounds.min[axis] = Math.min(bounds.min[axis], context.min[axis]);
                bounds.max[axis] = Math.max(bounds.max[axis], context.max[axis]);
            }
        camera.fit(bounds, viewport);
        refresh();
    };
    return {
        setDimensions(value: Dimensions) {
            const errors = site.setDimensions(value);
            if (!Object.keys(errors).length) fit();
            return errors;
        },
        setView(id: string) {
            camera.setView(id);
            refresh();
        },
        resize(size: Viewport) {
            if (size.width <= 0 || size.height <= 0) return;
            viewport = { ...size };
            fit();
        },
        refresh
    };
}
