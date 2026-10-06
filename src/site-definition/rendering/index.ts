import { Color } from 'playcanvas';
import type { AppBase, CameraComponent } from 'playcanvas';

import type { Bounds3 } from '../../shared/geometry/types.ts';
import type { Layout } from '../types.ts';

import { createEnvironment } from './environment.ts';
import { createSiteGrass } from './ground-material.ts';
import { createDaylight } from './lighting.ts';
import { createPlanting } from './planting.ts';

export { daylightConfig } from './config.ts';

export function createRendering(app: AppBase) {
    const environment = createEnvironment(app);
    const daylight = createDaylight(app);
    const grass = createSiteGrass(app);
    const planting = createPlanting(app);
    let contextVisible = true;
    const cameraBackgrounds = new Map<CameraComponent, Color>();
    const restoreBackgrounds = () => {
        for (const [camera, color] of cameraBackgrounds) camera.clearColor = color;
        cameraBackgrounds.clear();
    };
    return {
        setTreesVisible(value: boolean) { planting.setTreesVisible(value); },
        setHedgeVisible(value: boolean) { planting.setHedgeVisible(value); },
        setGrassVisible(value: boolean) {
            grass.setVisible(contextVisible);
            environment.setWhiteMode(!value);
            planting.setWhiteMode(!value);
            planting.setVisible(contextVisible);
        },
        setContextVisible(value: boolean) {
            contextVisible = value;
            environment.setVisible(value);
            grass.setVisible(value);
            planting.setVisible(value);
            if (value) restoreBackgrounds();
            else {
                for (const camera of app.root.findComponents('camera') as CameraComponent[]) {
                    if (!cameraBackgrounds.has(camera)) cameraBackgrounds.set(camera, camera.clearColor.clone());
                    camera.clearColor = new Color(1, 1, 1);
                }
            }
        },
        updateLayout(layout: Layout) { planting.updateLayout(layout); },
        updateBounds(bounds: Bounds3) {
            environment.updateBounds(bounds);
            grass.updateBounds(bounds);
            daylight.updateBounds(bounds);
        },
        destroy() {
            restoreBackgrounds();
            planting.destroy();
            grass.destroy();
            daylight.destroy();
            environment.destroy();
        }
    };
}
