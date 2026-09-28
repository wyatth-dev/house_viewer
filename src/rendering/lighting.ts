import { Color, Entity, SHADOW_PCF5 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

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
        shadowDistance: 600,
        numCascades: 1,
        shadowBias: 0.2,
        normalOffsetBias: 0.08
    });
    sun.setEulerAngles(...daylightConfig.sun.rotation);
    app.root.addChild(sun);
    return {
        updateBounds(bounds: Bounds3) {
            // Fit the shadow range to cameras framing this plot, including maximum yard sizes.
            const diagonal = Math.hypot(
                bounds.max.x - bounds.min.x,
                bounds.max.y - bounds.min.y,
                bounds.max.z - bounds.min.z
            );
            sun.light!.shadowDistance = Math.max(180, diagonal * 3);
        },
        destroy() {
            sun.destroy();
        }
    };
}
