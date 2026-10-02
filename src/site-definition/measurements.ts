import { Color, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { Footprint } from '../scene/house/types.ts';
import type { ProjectPoint } from '../shared/geometry/types.ts';
import { mmToMeters } from '../shared/geometry/units.ts';

import { sides } from './layout.ts';
import type { Dimensions, Layout, SiteSide } from './types.ts';
export function createMeasurements(app: AppBase, overlay: HTMLElement, footprint: Footprint) {
    const labels = new Map<SiteSide, HTMLDivElement>();
    const lines = new Map<SiteSide, [Vec3, Vec3]>();
    for (const side of sides) {
        const label = document.createElement('div');
        label.className = `measurement measurement-${side}`;
        overlay.append(label);
        labels.set(side, label);
    }
    const draw = () => {
        for (const [a, b] of lines.values()) {
            app.drawLine(a, b, new Color(0.16, 0.27, 0.22), false);
            const horizontal = Math.abs(a.x - b.x) > 0.001;
            const offset = horizontal ? new Vec3(0, 0, 200) : new Vec3(200, 0, 0);
            for (const p of [a, b])
                app.drawLine(p.clone().sub(offset), p.clone().add(offset), new Color(0.16, 0.27, 0.22), false);
        }
    };
    app.on('update', draw);
    return {
        update(layout: Layout, dimensions: Dimensions) {
            const x = footprint.width / 2,
                z = footprint.depth / 2,
                p = layout.property;
            lines.set('front', [new Vec3(0, 60, z), new Vec3(0, 60, p.maxZ)]);
            lines.set('back', [new Vec3(0, 60, -z), new Vec3(0, 60, p.minZ)]);
            lines.set('left', [new Vec3(-x, 60, 0), new Vec3(p.minX, 60, 0)]);
            lines.set('right', [new Vec3(x, 60, 0), new Vec3(p.maxX, 60, 0)]);
            for (const side of sides)
                labels.get(side)!.textContent =
                    `${side[0].toUpperCase() + side.slice(1)} · ${mmToMeters(dimensions[side]).toFixed(1)} m`;
        },
        refresh(project: ProjectPoint) {
            const placed: { x: number; y: number }[] = [];
            const width = overlay.clientWidth,
                height = overlay.clientHeight;
            for (const side of sides) {
                const label = labels.get(side)!,
                    line = lines.get(side);
                if (!line) continue;
                const p = line[0].clone().add(line[1]).mulScalar(0.5);
                const projected = project(p);
                label.hidden = !projected.visible;
                if (label.hidden) continue;
                const half = Math.min(label.offsetWidth / 2, width / 2);
                const x = Math.max(half, Math.min(width - half, projected.x));
                let y = Math.max(18, Math.min(height - 18, projected.y - 14));
                for (
                    let i = 0;
                    i < 4 && placed.some((other) => Math.abs(other.x - x) < 120 && Math.abs(other.y - y) < 30);
                    i++
                )
                    y = y + 32 < height - 18 ? y + 32 : Math.max(18, y - 64);
                placed.push({ x, y });
                label.style.left = `${x}px`;
                label.style.top = `${y}px`;
            }
        },
        destroy() {
            app.off('update', draw);
            labels.forEach((label) => label.remove());
            lines.clear();
        }
    };
}
