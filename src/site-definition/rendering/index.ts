import type { AppBase } from 'playcanvas';

import type { Bounds3 } from '../../shared/geometry/types.ts';

import { createEnvironment } from './environment.ts';
import { createSurroundingsMaterial } from './ground-material.ts';
import { createDaylight } from './lighting.ts';

export { daylightConfig } from './config.ts';

export function createRendering(app: AppBase) {
    const environment = createEnvironment(app);
    const daylight = createDaylight(app);
    const surroundings = createSurroundingsMaterial(app);
    return {
        updateBounds(bounds: Bounds3) {
            environment.updateBounds(bounds);
            daylight.updateBounds(bounds);
            surroundings.updateBounds(bounds);
        },
        destroy() {
            surroundings.destroy();
            daylight.destroy();
            environment.destroy();
        }
    };
}
