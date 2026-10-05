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
    options: { duration?: number; minimumFarClip?: number; maximumNearClip?: number; toneMapping?: number } = {}
): CameraController {
    if (!presets.length || new Set(presets.map((p) => p.id)).size !== presets.length)
        throw new Error('Camera presets must have unique IDs');
    const duration = Math.max(0, options.duration ?? 0.8);
    let active = presets[0].id,
        viewport: Viewport = { width: 1, height: 1 };
    let bounds: Bounds3 | undefined, current: Frame | undefined;
    let transition: { from: Frame; to: Frame; elapsed: number } | undefined;
    const cameras = new Map<string, Entity>(),
        frames = new Map<string, Frame>(),
        listeners = new Set<() => void>();
    for (const preset of presets) {
        const entity = new Entity(`View: ${preset.label}`);
        entity.addComponent('camera', {
            projection: preset.projection === 'perspective' ? PROJECTION_PERSPECTIVE : PROJECTION_ORTHOGRAPHIC,
            fov: preset.fov ?? 45,
            clearColor: new Color(0.91, 0.925, 0.91)
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
        entity.lookAt(frame.center.x, frame.center.y, frame.center.z);
        camera.orthoHeight = frame.halfHeight;
        camera.nearClip = Math.min(frame.near, options.maximumNearClip ?? Infinity);
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
        current = transitionFrame(transition.from, transition.to, progress, bounds, viewport);
        apply(active, current, progress < 1);
        if (progress === 1) transition = undefined;
        for (const listener of listeners) listener();
    };
    app.on('update', update);
    return {
        setView(id) {
            if (!cameras.has(id)) throw new Error(`Unknown camera: ${id}`);
            if (id === active) return;
            const target = frames.get(id);
            active = id;
            for (const [key, entity] of cameras) entity.enabled = key === active;
            if (current && target && duration > 0) {
                transition = { from: current, to: target, elapsed: 0 };
                apply(id, current, true);
            } else {
                transition = undefined;
                current = target;
                if (target) apply(id, target);
            }
        },
        fit(nextBounds, size) {
            bounds = structuredClone(nextBounds);
            viewport = { ...size };
            transition = undefined;
            for (const preset of presets) {
                const frame =
                    preset.projection === 'perspective'
                        ? fitPerspective(bounds, viewport, preset.direction, preset.fov ?? 45)
                        : fitOrthographic(bounds, viewport, preset.direction);
                frames.set(preset.id, frame);
                apply(preset.id, frame);
            }
            current = frames.get(active);
        },
        getState: () => ({ activePresetId: active }),
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
