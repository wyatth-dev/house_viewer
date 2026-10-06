import { Color } from 'playcanvas';
import type { AppBase, CameraComponent } from 'playcanvas';

import type { Bounds3 } from '../../shared/geometry/types.ts';

import { createEnvironment } from './environment.ts';
import { createSiteGrass } from './ground-material.ts';
import { createDaylight } from './lighting.ts';

export { daylightConfig } from './config.ts';

export function createRendering(app: AppBase) {
    const environment = createEnvironment(app);
    const daylight = createDaylight(app);
    const grass = createSiteGrass(app);
    let contextVisible = true;
    let grassVisible = true;
    const cameraBackgrounds = new Map<CameraComponent, Color>();
    const restoreBackgrounds = () => {
        for (const [camera, color] of cameraBackgrounds) camera.clearColor = color;
        cameraBackgrounds.clear();
    };
    return {
        setGrassVisible(value: boolean) {
            grassVisible = value;
            grass.setVisible(contextVisible && grassVisible);
        },
        setContextVisible(value: boolean) {
            contextVisible = value;
            environment.setVisible(value);
            grass.setVisible(value && grassVisible);
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
            grass.updateBounds(bounds);
            daylight.updateBounds(bounds);
        },
        destroy() {
            restoreBackgrounds();
            grass.destroy();
            daylight.destroy();
            environment.destroy();
        }
    };
}
