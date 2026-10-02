import type { Bounds3 } from '../../shared/geometry/types.ts';

/** Four rectangles around a hole: no realistic material inside the editable property. */
export function surroundingGeometry(bounds: Bounds3, extent: number, y: number) {
    const { min, max } = bounds;
    if (
        ![min.x, min.z, max.x, max.z, extent, y].every(Number.isFinite) ||
        min.x >= max.x ||
        min.z >= max.z ||
        Math.max(Math.abs(min.x), Math.abs(max.x), Math.abs(min.z), Math.abs(max.z)) >= extent
    )
        throw new Error('Invalid surroundings bounds');
    const rectangles = [
        [-extent, extent, -extent, min.z],
        [-extent, extent, max.z, extent],
        [-extent, min.x, min.z, max.z],
        [max.x, extent, min.z, max.z]
    ];
    const positions: number[] = [],
        normals: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    for (const [x0, x1, z0, z1] of rectangles) {
        const offset = positions.length / 3;
        for (const [x, z] of [
            [x0, z0],
            [x0, z1],
            [x1, z1],
            [x1, z0]
        ]) {
            positions.push(x, y, z);
            normals.push(0, 1, 0);
            uvs.push(x, z);
        }
        indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    }
    return { positions, normals, uvs, indices };
}
