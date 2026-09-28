import type { Bounds3, Point3, Viewport } from '../geometry/types.ts';

import type { Frame } from './framing.ts';
const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const projectionMix = (frame: Frame) => frame.projectionMix ?? (frame.projection === 'perspective' ? 1 : 0);
export const focusHeight = (frame: Frame) =>
    frame.projectionMix !== undefined
        ? frame.halfHeight
        : frame.projection === 'perspective'
          ? length(frame.position, frame.center) * frame.tanHalfFov!
          : frame.halfHeight;
/** Orbit on the shortest yaw arc; never lerp positions through the house. */
export function transitionFrame(from: Frame, to: Frame, progress: number, bounds: Bounds3, viewport: Viewport): Frame {
    if (progress <= 0) return from;
    if (progress >= 1) return to;
    const t = progress * progress * (3 - 2 * progress);
    const startYaw = Math.atan2(from.out.x, from.out.z),
        endYaw = Math.atan2(to.out.x, to.out.z);
    const delta = Math.atan2(Math.sin(endYaw - startYaw), Math.cos(endYaw - startYaw));
    const yaw = startYaw + delta * t,
        pitch = lerp(Math.asin(from.out.y), Math.asin(to.out.y), t);
    const out = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
    const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
    const up = { x: -Math.sin(yaw) * Math.sin(pitch), y: Math.cos(pitch), z: -Math.cos(yaw) * Math.sin(pitch) };
    const center = {
        x: lerp(from.center.x, to.center.x, t),
        y: lerp(from.center.y, to.center.y, t),
        z: lerp(from.center.z, to.center.z, t)
    };
    const mix = lerp(projectionMix(from), projectionMix(to), t);
    const points: Point3[] = [];
    for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z])
                points.push({ x: x - center.x, y: y - center.y, z: z - center.z });
    const maxDepth = Math.max(...points.map((p) => Math.abs(dot(p, out))));
    const distance = Math.max(
        maxDepth + 1,
        lerp(length(from.position, from.center), length(to.position, to.center), t)
    );
    let halfHeight = lerp(focusHeight(from), focusHeight(to), t);
    const aspect = Math.max(1, viewport.width) / Math.max(1, viewport.height);
    for (const p of points) {
        const w = 1 - mix + (mix * (distance - dot(p, out))) / distance;
        halfHeight = Math.max(
            halfHeight,
            (1.15 * Math.abs(dot(p, up))) / w,
            (1.15 * Math.abs(dot(p, right))) / (aspect * w)
        );
    }
    return {
        center,
        out,
        right,
        up,
        projectionMix: mix,
        halfHeight,
        position: { x: center.x + out.x * distance, y: center.y + out.y * distance, z: center.z + out.z * distance },
        near: Math.max(0.01, (distance - maxDepth) * 0.5),
        far: distance + maxDepth + 1
    };
}
/** A continuous lens: w=1 for orthographic, w=depth/focusDistance for perspective. */
export function projectionMatrix(frame: Frame, viewport: Viewport): number[] {
    const mix = projectionMix(frame),
        distance = length(frame.position, frame.center),
        height = focusHeight(frame);
    const nearW = 1 - mix + (mix * frame.near) / distance,
        farW = 1 - mix + (mix * frame.far) / distance;
    const a = -(farW + nearW) / (frame.far - frame.near),
        b = -nearW + frame.near * a;
    return [
        1 / ((height * viewport.width) / viewport.height),
        0,
        0,
        0,
        0,
        1 / height,
        0,
        0,
        0,
        0,
        a,
        -mix / distance,
        0,
        0,
        b,
        1 - mix
    ];
}
