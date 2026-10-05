import type { AppBase } from 'playcanvas';

import type { Footprint } from '../scene/house/types.ts';

import { createGround } from './ground.ts';
import { defaults, calculateLayout, validateDimensions } from './layout.ts';
import { createMeasurements } from './measurements.ts';
import type { SiteController } from './types.ts';
export function createSiteController(app: AppBase, footprint: Footprint, overlay: HTMLElement): SiteController {
    let dimensions = { ...defaults },
        layout = calculateLayout(footprint, dimensions);
    const ground = createGround(app),
        measurements = createMeasurements(app, overlay, footprint);
    const update = () => {
        ground.update(layout);
        measurements.update(layout, dimensions);
    };
    update();
    return {
        setDimensions(value) {
            const errors = validateDimensions(value);
            if (Object.keys(errors).length) return errors;
            dimensions = { ...value };
            layout = calculateLayout(footprint, dimensions);
            update();
            return {};
        },
        getState: () => ({ dimensions: { ...dimensions } }),
        getLayout: () => structuredClone(layout),
        getBounds: () => ({
            min: { x: layout.property.minX, y: 0, z: layout.property.minZ },
            max: { x: layout.property.maxX, y: 60, z: layout.property.maxZ }
        }),
        setMeasurementsVisible: measurements.setVisible,
        setDimensionEditor: measurements.setEditor,
        refreshLabels: (project) => measurements.refresh(project),
        destroy() {
            ground.destroy();
            measurements.destroy();
        }
    };
}
