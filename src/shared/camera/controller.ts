import { Entity, Color, Vec3, PROJECTION_ORTHOGRAPHIC, PROJECTION_PERSPECTIVE } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { Bounds3, Viewport } from '../geometry/types.ts';

import { fitOrthographic, fitPerspective, projectPoint } from './framing.ts';
import type { Frame } from './framing.ts';
import { transitionFrame, projectionMatrix, projectionMix, focusHeight } from './transition.ts';
import type { CameraController, CameraPreset } from './types.ts';
export function createCameraController(
    app: AppBase,
    presets: CameraPreset[],
    options: {
        duration?: number;
        minimumFarClip?: number;
        maximumNearClip?: number;
        minimumNearClip?: number;
        toneMapping?: number;
        minimumCameraY?: number;
    } = {}
): CameraController {
    if (!presets.length || new Set(presets.map((p) => p.id)).size !== presets.length)
        throw new Error('Camera presets must have unique IDs');
    const duration = Math.max(0, options.duration ?? 0.8);
    let active = presets[0].id,
        viewport: Viewport = { width: 1, height: 1 };
    let bounds: Bounds3 | undefined, current: Frame | undefined;
    let manuallyChanged = false;
    let transition: { from: Frame; to: Frame; elapsed: number; containBounds: boolean } | undefined;
    const cameras = new Map<string, Entity>(),
        frames = new Map<string, Frame>(),
        listeners = new Set<() => void>();
    for (const preset of presets) {
        const entity = new Entity(`View: ${preset.label}`);
        entity.addComponent('camera', {
            projection: preset.projection === 'perspective' ? PROJECTION_PERSPECTIVE : PROJECTION_ORTHOGRAPHIC,
            fov: preset.fov ?? 45,
            clearColor: new Color(0.98, 0.984, 0.988)
        });
        if (options.toneMapping !== undefined) entity.camera!.toneMapping = options.toneMapping;
        entity.enabled = preset.id === active;
        app.root.addChild(entity);
        cameras.set(preset.id, entity);
    }
    // Restore the engine's own default callback after the temporary blended lens.
    const defaultProjection = cameras.get(presets[0].id)!.camera!.calculateProjection;
    const frustums = new Map(
        [...cameras].map(([id, entity]) => [
            id,
            {
                native: entity.camera!.camera.getFrustumCorners,
                corners: Array.from({ length: 8 }, () => new Vec3())
            }
        ])
    );
    const apply = (id: string, frame: Frame, custom = false) => {
        const entity = cameras.get(id)!,
            camera = entity.camera!;
        entity.setPosition(frame.position.x, frame.position.y, frame.position.z);
        entity.lookAt(frame.center.x, frame.center.y, frame.center.z, frame.up.x, frame.up.y, frame.up.z);
        camera.orthoHeight = frame.halfHeight;
        // Keep foreground ground in front of the near plane at low elevations.
        // Higher views retain a useful near distance for depth-buffer precision.
        const groundNearLimit = options.minimumCameraY === undefined ? Infinity : Math.max(1, frame.position.y * 0.25);
        const focusDistance = Math.hypot(
            frame.position.x - frame.center.x,
            frame.position.y - frame.center.y,
            frame.position.z - frame.center.z
        );
        const nearFloor = Math.min(options.minimumNearClip ?? 0.01, focusDistance * 0.01);
        camera.nearClip = Math.max(
            nearFloor,
            Math.min(frame.near, options.maximumNearClip ?? Infinity, groundNearLimit)
        );
        camera.farClip = Math.max(frame.far, options.minimumFarClip ?? 0);
        camera.calculateProjection = custom
            ? (matrix) => {
                  matrix.data.set(projectionMatrix({ ...frame, near: camera.nearClip, far: camera.farClip }, viewport));
              }
            : defaultProjection;
        const frustum = frustums.get(id)!;
        // PlayCanvas fits directional shadows with getFrustumCorners, which ignores
        // calculateProjection. Supply corners from the same blended lens during motion.
        camera.camera.getFrustumCorners = custom
            ? (near = camera.nearClip, far = camera.farClip) => {
                  const m = projectionMatrix({ ...frame, near: camera.nearClip, far: camera.farClip }, viewport);
                  for (let i = 0; i < 8; i++) {
                      const depth = i < 4 ? near : far;
                      const w = m[15] - m[11] * depth;
                      const x = w / m[0],
                          y = w / m[5];
                      frustum.corners[i].set(i % 4 < 2 ? x : -x, i % 4 === 1 || i % 4 === 2 ? y : -y, -depth);
                  }
                  return frustum.corners;
              }
            : frustum.native;
    };
    const update = (dt: number) => {
        if (!transition || !bounds) return;
        transition.elapsed += Math.max(0, dt);
        const progress = Math.min(1, transition.elapsed / duration);
        current = transitionFrame(transition.from, transition.to, progress, bounds, viewport, transition.containBounds);
        apply(active, current, progress < 1 || current.projectionMix !== undefined);
        if (progress === 1) transition = undefined;
        for (const listener of listeners) listener();
    };
    app.on('update', update);
    const applyManual = (frame: Frame) => {
        transition = undefined;
        manuallyChanged = true;
        let distance = Math.hypot(
            frame.position.x - frame.center.x,
            frame.position.y - frame.center.y,
            frame.position.z - frame.center.z
        );
        if (options.minimumCameraY !== undefined && frame.position.y < options.minimumCameraY) {
            // Tiny low targets need orbit clearance; clamping to sin(pitch)=1 loses yaw.
            distance = Math.max(distance, (options.minimumCameraY - frame.center.y) * 2);
            const yaw = Math.atan2(frame.out.x, frame.out.z);
            const pitch = Math.asin(Math.max(-1, Math.min(1, (options.minimumCameraY - frame.center.y) / distance)));
            const out = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
            frame = {
                ...frame,
                out,
                right: { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) },
                up: { x: -Math.sin(yaw) * Math.sin(pitch), y: Math.cos(pitch), z: -Math.cos(yaw) * Math.sin(pitch) },
                position: {
                    x: frame.center.x + out.x * distance,
                    y: frame.center.y + out.y * distance,
                    z: frame.center.z + out.z * distance
                }
            };
        }
        const radius = bounds
            ? Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) / 2
            : 1;
        current = { ...frame, near: Math.max(0.01, distance - radius * 1.2), far: distance + radius * 1.2 + 1 };
        apply(active, current, current.projectionMix !== undefined);
        for (const listener of listeners) listener();
    };
    return {
        setView(id) {
            if (!cameras.has(id)) throw new Error(`Unknown camera: ${id}`);
            if (id === active && !manuallyChanged) return;
            manuallyChanged = false;
            const target = frames.get(id);
            active = id;
            for (const [key, entity] of cameras) entity.enabled = key === active;
            if (current && target && duration > 0) {
                transition = { from: current, to: target, elapsed: 0, containBounds: true };
                apply(id, current, true);
            } else {
                transition = undefined;
                current = target;
                if (target) apply(id, target);
            }
        },
        fit(nextBounds, size, animate = false, basis, preserveView = false) {
            const keepView = preserveView && current !== undefined;
            manuallyChanged = keepView;
            const from = current;
            bounds = structuredClone(nextBounds);
            viewport = { ...size };
            transition = undefined;
            for (const preset of presets) {
                const local = preset.direction;
                const direction = basis
                    ? {
                          x: basis.right.x * local.x + basis.up.x * local.y + basis.front.x * local.z,
                          y: basis.right.y * local.x + basis.up.y * local.y + basis.front.y * local.z,
                          z: basis.right.z * local.x + basis.up.z * local.y + basis.front.z * local.z
                      }
                    : local;
                const frame =
                    preset.projection === 'perspective'
                        ? fitPerspective(bounds, viewport, direction, preset.fov ?? 45)
                        : fitOrthographic(bounds, viewport, direction);
                frames.set(preset.id, frame);
                apply(preset.id, frame);
            }
            let target = frames.get(active)!;
            if (keepView && from) {
                // Transition frames carry a blended lens instead of projection/tanHalfFov.
                // Read the visible lens before reframing, including interrupted transitions.
                const mix = projectionMix(from);
                const distance = Math.hypot(
                    from.position.x - from.center.x,
                    from.position.y - from.center.y,
                    from.position.z - from.center.z
                );
                target = mix > 0
                    ? fitPerspective(bounds, viewport, from.out,
                        2 * Math.atan(focusHeight(from) / distance) * 180 / Math.PI)
                    : fitOrthographic(bounds, viewport, from.out);
                if (mix > 0 && mix < 1) {
                    const targetDistance = Math.hypot(
                        target.position.x - target.center.x,
                        target.position.y - target.center.y,
                        target.position.z - target.center.z
                    );
                    target = { ...target, projectionMix: mix, halfHeight: targetDistance * target.tanHalfFov! };
                }
            }
            if (animate && from && duration > 0) {
                current = from;
                transition = { from, to: target, elapsed: 0, containBounds: false };
                apply(active, from, true);
            } else {
                current = target;
                apply(active, target, target.projectionMix !== undefined);
            }
            for (const listener of listeners) listener();
        },
        orbit(yawDelta, pitchDelta) {
            if (!current || ![yawDelta, pitchDelta].every(Number.isFinite)) return;
            const yaw = Math.atan2(current.out.x, current.out.z) + yawDelta;
            const pitch = Math.max(
                -Math.PI / 2 + 0.02,
                Math.min(Math.PI / 2 - 0.02, Math.asin(current.out.y) + pitchDelta)
            );
            const out = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
            const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
            const up = { x: -Math.sin(yaw) * Math.sin(pitch), y: Math.cos(pitch), z: -Math.cos(yaw) * Math.sin(pitch) };
            const distance = Math.hypot(
                current.position.x - current.center.x,
                current.position.y - current.center.y,
                current.position.z - current.center.z
            );
            const center = current.center;
            applyManual({
                ...current,
                out,
                right,
                up,
                position: {
                    x: center.x + out.x * distance,
                    y: center.y + out.y * distance,
                    z: center.z + out.z * distance
                }
            });
        },
        zoom(factor) {
            if (!current || !Number.isFinite(factor) || factor <= 0) return;
            const baseline = frames.get(active);
            if (!baseline) return;
            const height = focusHeight(current);
            const targetHeight = Math.max(
                focusHeight(baseline) * 0.1,
                Math.min(focusHeight(baseline) * 10, height * factor)
            );
            const ratio = targetHeight / height;
            const center = current.center;
            applyManual({
                ...current,
                halfHeight: current.halfHeight * ratio,
                position: {
                    x: center.x + (current.position.x - center.x) * ratio,
                    y: center.y + (current.position.y - center.y) * ratio,
                    z: center.z + (current.position.z - center.z) * ratio
                }
            });
        },
        getState: () => ({ activePresetId: active }),
        snapshot: () => current && bounds ? structuredClone({ activePresetId: active, frame: current, bounds }) : undefined,
        restore(snapshot) {
            if (!cameras.has(snapshot.activePresetId)) return;
            const from = current;
            const target = structuredClone(snapshot.frame);
            manuallyChanged = true;
            active = snapshot.activePresetId;
            bounds = structuredClone(snapshot.bounds);
            for (const [id, entity] of cameras) entity.enabled = id === active;
            if (from && duration > 0) {
                transition = { from: structuredClone(from), to: target, elapsed: 0, containBounds: false };
                apply(active, from, true);
            } else {
                transition = undefined;
                current = target;
                apply(active, current, current.projectionMix !== undefined);
            }
            for (const listener of listeners) listener();
        },
        project: (point) => (current ? projectPoint(point, current, viewport) : { x: 0, y: 0, visible: false }),
        screenToGround(x, y, groundYMm = 0) {
            if (
                !current ||
                ![x, y, groundYMm].every(Number.isFinite) ||
                x < 0 ||
                x > viewport.width ||
                y < 0 ||
                y > viewport.height
            )
                return undefined;
            const frame = current,
                mix = projectionMix(frame),
                height = focusHeight(frame);
            const horizontal = (((2 * x) / viewport.width - 1) * height * viewport.width) / viewport.height;
            const vertical = (1 - (2 * y) / viewport.height) * height;
            const offset = {
                x: frame.right.x * horizontal + frame.up.x * vertical,
                y: frame.right.y * horizontal + frame.up.y * vertical,
                z: frame.right.z * horizontal + frame.up.z * vertical
            };
            const distance = Math.hypot(
                frame.position.x - frame.center.x,
                frame.position.y - frame.center.y,
                frame.position.z - frame.center.z
            );
            const origin = {
                x: frame.position.x + (1 - mix) * offset.x,
                y: frame.position.y + (1 - mix) * offset.y,
                z: frame.position.z + (1 - mix) * offset.z
            };
            const direction = {
                x: -frame.out.x + (mix * offset.x) / distance,
                y: -frame.out.y + (mix * offset.y) / distance,
                z: -frame.out.z + (mix * offset.z) / distance
            };
            if (Math.abs(direction.y) < 1e-8) return undefined;
            const travel = (groundYMm - origin.y) / direction.y;
            if (travel < frame.near || travel > frame.far) return undefined;
            return { x: origin.x + direction.x * travel, y: groundYMm, z: origin.z + direction.z * travel };
        },
        onMove(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        destroy() {
            app.off('update', update);
            listeners.clear();
            transition = undefined;
            for (const e of cameras.values()) e.destroy();
            cameras.clear();
            frames.clear();
        }
    };
}
