import { Color, Entity, SHADOW_PCF5 } from 'playcanvas';
import type { AppBase, CameraComponentSystem } from 'playcanvas';

import type { Bounds3 } from '../geometry/types.ts';

import { daylightConfig } from './config.ts';

export function createDaylight(app: AppBase) {
    const sun = new Entity('Environment sunlight');
    sun.addComponent('light', {
        type: 'directional',
        color: new Color(1, 0.985, 0.96),
        intensity: daylightConfig.sun.intensity,
        castShadows: true,
        shadowType: SHADOW_PCF5,
        shadowResolution: daylightConfig.sun.shadowResolution,
        shadowDistance: 600000,
        numCascades: 1,
        shadowBias: 0.2,
        normalOffsetBias: 80
    });
    // The component clamps its UI bias; the engine bias is scaled to preserve world-space depth offset.
    sun.light!.light.shadowBias *= 1000;
    sun.setEulerAngles(...daylightConfig.sun.rotation);
    app.root.addChild(sun);
    let sceneBounds: Bounds3 | undefined;
    let minimumDistance = 600000;
    const updateShadowRange = () => {
        if (!sceneBounds) return;
        let distance = minimumDistance;
        // Perspective framing moves the camera farther away in tall windows.
        // Shadow distance is measured from that camera, not from the house.
        const padding = Math.max(20000, (sceneBounds.max.y - sceneBounds.min.y) * 1.5);
        for (const camera of (app.systems.camera as CameraComponentSystem).cameras) {
            if (!camera.enabled || !camera.entity.enabled || camera.renderTarget) continue;
            const position = camera.entity.getPosition();
            const forward = camera.entity.forward;
            for (const x of [sceneBounds.min.x - padding, sceneBounds.max.x + padding])
                for (const y of [sceneBounds.min.y, sceneBounds.max.y])
                    for (const z of [sceneBounds.min.z - padding, sceneBounds.max.z + padding]) {
                        const depth =
                            (x - position.x) * forward.x + (y - position.y) * forward.y + (z - position.z) * forward.z;
                        distance = Math.max(distance, depth + 10000);
                    }
        }
        sun.light!.shadowDistance = distance;
    };
    // Runs after camera motion and before shadow culling, including the first frame of a switch.
    app.on('prerender', updateShadowRange);
    return {
        updateBounds(bounds: Bounds3) {
            sceneBounds = structuredClone(bounds);
            // Keep the existing baseline coverage, extending it for distant cameras.
            const diagonal = Math.hypot(
                bounds.max.x - bounds.min.x,
                bounds.max.y - bounds.min.y,
                bounds.max.z - bounds.min.z
            );
            minimumDistance = Math.max(180000, diagonal * 3);
            updateShadowRange();
        },
        destroy() {
            app.off('prerender', updateShadowRange);
            sun.destroy();
        }
    };
}
