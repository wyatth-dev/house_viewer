import type { Bounds3, Point3, Projection, Viewport } from '../geometry/types.ts';
export type Frame = {
    projectionMix?: number;
    projection?: 'orthographic' | 'perspective';
    tanHalfFov?: number;
    center: Point3;
    position: Point3;
    right: Point3;
    up: Point3;
    out: Point3;
    halfHeight: number;
    near: number;
    far: number;
};
const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
const subtract = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Point3, b: Point3): Point3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
});
const normalize = (p: Point3): Point3 => {
    const length = Math.hypot(p.x, p.y, p.z);
    if (!length) throw new Error('Camera direction cannot be zero');
    return { x: p.x / length, y: p.y / length, z: p.z / length };
};
/** Lengths are millimeters, including the small fit/clip floors used for engineering details. */
export function fitOrthographic(bounds: Bounds3, viewport: Viewport, direction: Point3): Frame {
    const center = {
        x: (bounds.min.x + bounds.max.x) / 2,
        y: (bounds.min.y + bounds.max.y) / 2,
        z: (bounds.min.z + bounds.max.z) / 2
    };
    const out = normalize(direction),
        right = normalize(cross({ x: 0, y: 1, z: 0 }, out)),
        up = cross(out, right);
    let horizontal = 0,
        vertical = 0,
        depth = 0;
    for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z]) {
                const p = subtract({ x, y, z }, center);
                horizontal = Math.max(horizontal, Math.abs(dot(p, right)));
                vertical = Math.max(vertical, Math.abs(dot(p, up)));
                depth = Math.max(depth, Math.abs(dot(p, out)));
            }
    const radius = Math.max(
        1,
        Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) / 2
    );
    const distance = radius * 3;
    return {
        center,
        out,
        right,
        up,
        halfHeight:
            Math.max(0.1, vertical, horizontal / (Math.max(1, viewport.width) / Math.max(1, viewport.height))) * 1.15,
        position: { x: center.x + out.x * distance, y: center.y + out.y * distance, z: center.z + out.z * distance },
        near: Math.max(0.01, distance - depth - radius * 0.1),
        far: distance + depth + radius * 0.1
    };
}
export function projectPoint(point: Point3, frame: Frame, viewport: Viewport): Projection {
    const p = subtract(point, frame.center);
    const depth = dot(subtract(frame.position, point), frame.out);
    const focusDistance = Math.hypot(
        frame.position.x - frame.center.x,
        frame.position.y - frame.center.y,
        frame.position.z - frame.center.z
    );
    const halfHeight =
        frame.projectionMix !== undefined
            ? frame.halfHeight * (1 - frame.projectionMix + (frame.projectionMix * depth) / focusDistance)
            : frame.projection === 'perspective'
              ? depth * frame.tanHalfFov!
              : frame.halfHeight;
    const nx = dot(p, frame.right) / ((halfHeight * viewport.width) / Math.max(viewport.height, 1));
    const ny = dot(p, frame.up) / halfHeight;
    return {
        x: ((nx + 1) * viewport.width) / 2,
        y: ((1 - ny) * viewport.height) / 2,
        visible: Math.abs(nx) <= 1 && Math.abs(ny) <= 1 && depth >= frame.near && depth <= frame.far
    };
}

/** Fit every corner inside a perspective frustum with 15% screen-space margin. */
export function fitPerspective(bounds: Bounds3, viewport: Viewport, direction: Point3, fov = 45): Frame {
    if (!Number.isFinite(fov) || fov <= 0 || fov >= 180) throw new Error('Invalid perspective field of view');
    const frame = fitOrthographic(bounds, viewport, direction);
    const tanHalfFov = Math.tan((fov * Math.PI) / 360);
    const tanHorizontal = (tanHalfFov * Math.max(1, viewport.width)) / Math.max(1, viewport.height);
    let distance = 1,
        maxDepth = 0;
    for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z]) {
                const p = subtract({ x, y, z }, frame.center);
                const depth = dot(p, frame.out);
                maxDepth = Math.max(maxDepth, Math.abs(depth));
                distance = Math.max(
                    distance,
                    depth +
                        1.15 *
                            Math.max(
                                Math.abs(dot(p, frame.right)) / tanHorizontal,
                                Math.abs(dot(p, frame.up)) / tanHalfFov
                            )
                );
            }
    distance = Math.max(distance, maxDepth + 1);
    return {
        ...frame,
        projection: 'perspective',
        tanHalfFov,
        position: {
            x: frame.center.x + frame.out.x * distance,
            y: frame.center.y + frame.out.y * distance,
            z: frame.center.z + frame.out.z * distance
        },
        near: Math.max(0.01, (distance - maxDepth) * 0.5),
        far: distance + maxDepth + 1
    };
}
