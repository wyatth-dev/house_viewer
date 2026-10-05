import type { AppBase } from 'playcanvas';

import type { Footprint } from '../scene/house/types.ts';
import { createDimensionOverlay } from '../shared/measurements/dimension-overlay.ts';

import { sides } from './layout.ts';
import type { Dimensions, Layout, SiteSide } from './types.ts';

export function createMeasurements(app: AppBase, overlay: HTMLElement, footprint: Footprint) {
    const view = createDimensionOverlay(app, overlay);
    let edit: ((side: SiteSide, valueMm: number) => string | undefined) | undefined;
    return {
        ...view,
        setEditor(callback: (side: SiteSide, valueMm: number) => string | undefined) {
            edit = callback;
        },
        update(layout: Layout, dimensions: Dimensions) {
            const x = footprint.width / 2,
                z = footprint.depth / 2,
                p = layout.property;
            const lines = {
                front: [
                    { x: 0, y: 60, z },
                    { x: 0, y: 60, z: p.maxZ }
                ],
                back: [
                    { x: 0, y: 60, z: -z },
                    { x: 0, y: 60, z: p.minZ }
                ],
                left: [
                    { x: -x, y: 60, z: 0 },
                    { x: p.minX, y: 60, z: 0 }
                ],
                right: [
                    { x, y: 60, z: 0 },
                    { x: p.maxX, y: 60, z: 0 }
                ]
            };
            view.update(
                sides.map((side) => ({
                    id: side,
                    label: side[0].toUpperCase() + side.slice(1),
                    start: lines[side][0],
                    end: lines[side][1],
                    valueMm: dimensions[side],
                    edit: (value) => edit?.(side, value)
                }))
            );
        }
    };
}
