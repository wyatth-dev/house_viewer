import type { Bounds3 } from '../../shared/geometry/types.ts';

export function landscapeLayout(property: Bounds3) {
    const road = { z: property.max.z + 4500, width: 6000, length: 2400000, shoulder: 400 };
    // Frame the property and nearby road strip; the distant road ends are context only.
    const bounds: Bounds3 = {
        min: { ...property.min },
        max: { ...property.max, z: road.z + road.width / 2 + road.shoulder }
    };
    return { road, bounds };
}
