import { Color, Entity, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { VarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import { fitPerspective } from '../shared/camera/framing.ts';
import type { Bounds3 } from '../shared/geometry/types.ts';

export function createProductCamera(
    app: AppBase,
    canvas: HTMLCanvasElement,
    getParams: () => VarendaParams,
    options: { duration?: number } = {}
) {
    const duration = options.duration ?? 0.8;
    const camera = new Entity('Product camera');
    camera.addComponent('camera', { clearColor: new Color(0.9, 0.93, 0.91), nearClip: 0.1, farClip: 30000 });
    app.root.addChild(camera);
    let center = new Vec3(),
        destroyed = false;
    let movement:
        { fromPosition: Vec3; fromCenter: Vec3; toPosition: Vec3; toCenter: Vec3; elapsed: number } | undefined;
    const update = (dt: number) => {
        if (!movement) return;
        movement.elapsed += dt;
        const progress = Math.min(1, movement.elapsed / Math.max(duration, 0.001));
        const t = progress * progress * (3 - 2 * progress);
        camera.setPosition(new Vec3().lerp(movement.fromPosition, movement.toPosition, t));
        center.lerp(movement.fromCenter, movement.toCenter, t);
        camera.lookAt(center);
        if (progress === 1) movement = undefined;
    };
    app.on('update', update);
    const focus = (bounds: Bounds3, animate = true) => {
        if (destroyed || !canvas.clientWidth || !canvas.clientHeight) return;
        const frame = fitPerspective(
            bounds,
            { width: canvas.clientWidth, height: canvas.clientHeight },
            { x: 0.2, y: 0.7, z: 1 },
            45
        );
        const position = new Vec3(frame.position.x, frame.position.y, frame.position.z);
        const target = new Vec3(frame.center.x, frame.center.y, frame.center.z);
        camera.camera!.nearClip = Math.min(frame.near, 0.1);
        const params = getParams();
        camera.camera!.farClip = Math.max(
            frame.far,
            Math.hypot(params.widthMm, params.depthMm, params.wallHeightMm) * 4
        );
        if (!animate || duration === 0) {
            movement = undefined;
            camera.setPosition(position);
            center = target;
            camera.lookAt(center);
            return;
        }
        movement = {
            fromPosition: camera.getPosition().clone(),
            fromCenter: center.clone(),
            toPosition: position,
            toCenter: target,
            elapsed: 0
        };
    };
    return {
        entity: camera,
        focus,
        fit(animate = true) {
            const params = getParams();
            focus(
                {
                    min: { x: -params.widthMm / 2 - 100, y: 0, z: -100 },
                    max: {
                        x: params.widthMm / 2 + 100,
                        y: Math.max(params.undersideHeightMm + 150, params.wallHeightMm + 150),
                        z: params.depthMm + 100
                    }
                },
                animate
            );
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            app.off('update', update);
            camera.destroy();
        }
    };
}
