import type { Bounds3 } from '../geometry/types.ts';

export function landscapeLayout(property: Bounds3) {
    const { min, max } = property;
    const trees = [
        { x: min.x - 6, z: min.z + (max.z - min.z) * 0.25, scale: 1, yaw: 15 },
        { x: max.x + 6, z: min.z + (max.z - min.z) * 0.42, scale: 1.12, yaw: 135 },
        { x: min.x + (max.x - min.x) * 0.26, z: min.z - 7, scale: 0.9, yaw: 240 },
        { x: min.x + (max.x - min.x) * 0.74, z: min.z - 8, scale: 1.06, yaw: 310 }
    ];
    const road = { z: max.z + 4.5, width: 6, length: 2400, shoulder: 0.4 };
    const bounds = { min: { x: min.x - 10, y: 0, z: min.z - 12 }, max: { x: max.x + 10, y: 12, z: max.z + 9 } };
    return { trees, road, bounds };
}
