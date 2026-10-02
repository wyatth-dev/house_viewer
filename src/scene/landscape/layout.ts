import type { Bounds3 } from '../../shared/geometry/types.ts';

export function landscapeLayout(property: Bounds3) {
    const { min, max } = property;
    const trees = [
        { x: min.x - 6000, z: min.z + (max.z - min.z) * 0.25, scale: 1, yaw: 15 },
        { x: max.x + 6000, z: min.z + (max.z - min.z) * 0.42, scale: 1.12, yaw: 135 },
        { x: min.x + (max.x - min.x) * 0.26, z: min.z - 7000, scale: 0.9, yaw: 240 },
        { x: min.x + (max.x - min.x) * 0.74, z: min.z - 8000, scale: 1.06, yaw: 310 }
    ];
    const road = { z: max.z + 4500, width: 6000, length: 2400000, shoulder: 400 };
    const bounds = { min: { x: min.x - 10000, y: 0, z: min.z - 12000 }, max: { x: max.x + 10000, y: 12000, z: max.z + 9000 } };
    return { trees, road, bounds };
}
