import { Color } from 'playcanvas';
import type { AppBase, CameraComponent } from 'playcanvas';

import type { Bounds3 } from '../../shared/geometry/types.ts';

import { createEnvironment } from './environment.ts';
import { createSurroundingsMaterial } from './ground-material.ts';
import { createDaylight } from './lighting.ts';

export { daylightConfig } from './config.ts';

export function createRendering(app: AppBase) {
    const environment = createEnvironment(app);
    const daylight = createDaylight(app);
    const surroundings = createSurroundingsMaterial(app);
    const cameraBackgrounds = new Map<CameraComponent, Color>();
    const restoreBackgrounds = () => {
        for (const [camera, color] of cameraBackgrounds) camera.clearColor = color;
        cameraBackgrounds.clear();
    };
    return {
        setContextVisible(value: boolean) {
            environment.setVisible(value);
            surroundings.setVisible(value);
            if (value) restoreBackgrounds();
            else {
                for (const camera of app.root.findComponents('camera') as CameraComponent[]) {
                    if (!cameraBackgrounds.has(camera)) cameraBackgrounds.set(camera, camera.clearColor.clone());
                    camera.clearColor = new Color(1, 1, 1);
                }
            }
        },
        updateBounds(bounds: Bounds3) {
            environment.updateBounds(bounds);
            daylight.updateBounds(bounds);
            surroundings.updateBounds(bounds);
        },
        destroy() {
            restoreBackgrounds();
            surroundings.destroy();
            daylight.destroy();
            environment.destroy();
        }
    };
}
