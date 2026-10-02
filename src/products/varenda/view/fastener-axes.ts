import { Vec3 } from 'playcanvas';
import type { Entity } from 'playcanvas';

import type { Bounds3 } from '../../../shared/geometry/types.ts';
import type { InstalledFastener } from '../../parametric-engine/varenda/production-list.ts';

/** Visual length only: endpoints do not claim an engineering fastener length. */
export function axisEndpoints(root: Entity, hardware: InstalledFastener): [Vec3, Vec3] {
    const point = hardware.positionMm,
        axis = hardware.axisUnit;
    return [-20, 20].map((distance) =>
        root
            .getWorldTransform()
            .transformPoint(
                new Vec3(point.x + axis.x * distance, point.z + axis.z * distance, -point.y - axis.y * distance)
            )
    ) as [Vec3, Vec3];
}
export function axisBounds(root: Entity, hardware: InstalledFastener): Bounds3 {
    const [a, b] = axisEndpoints(root, hardware);
    return {
        min: { x: Math.min(a.x, b.x) - 2, y: Math.min(a.y, b.y) - 2, z: Math.min(a.z, b.z) - 2 },
        max: { x: Math.max(a.x, b.x) + 2, y: Math.max(a.y, b.y) + 2, z: Math.max(a.z, b.z) + 2 }
    };
}
