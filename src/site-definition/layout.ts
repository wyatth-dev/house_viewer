import type { Footprint } from '../house/types.ts';

import type { Dimensions, DimensionErrors, Layout, SiteSide } from './types.ts';
export const sides: SiteSide[] = ['front', 'back', 'left', 'right'];
export const defaults: Dimensions = { front: 5000, back: 7000, left: 2000, right: 2000 };
export function validateDimensions(value: Dimensions): DimensionErrors {
    const errors: DimensionErrors = {};
    for (const side of sides)
        if (!Number.isFinite(value[side]) || value[side] < 0 || value[side] > 50000)
            errors[side] = 'Enter a distance from 0 to 50 m.';
    return errors;
}
export function calculateLayout(house: Footprint, d: Dimensions): Layout {
    if (Object.keys(validateDimensions(d)).length) throw new Error('Invalid site dimensions');
    if (!Number.isFinite(house.width) || !Number.isFinite(house.depth) || house.width <= 0 || house.depth <= 0)
        throw new Error('Invalid house footprint');
    const x = house.width / 2,
        z = house.depth / 2;
    const property = { minX: -x - d.left, maxX: x + d.right, minZ: -z - d.back, maxZ: z + d.front };
    return {
        property,
        width: house.width + d.left + d.right,
        depth: house.depth + d.front + d.back,
        regions: {
            front: { minX: property.minX, maxX: property.maxX, minZ: z, maxZ: property.maxZ },
            back: { minX: property.minX, maxX: property.maxX, minZ: property.minZ, maxZ: -z },
            left: { minX: property.minX, maxX: -x, minZ: -z, maxZ: z },
            right: { minX: x, maxX: property.maxX, minZ: -z, maxZ: z }
        }
    };
}
