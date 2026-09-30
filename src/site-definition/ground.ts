import { Color, Entity, StandardMaterial, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { sides } from './layout.ts';
import type { Layout, SiteSide } from './types.ts';
export function createGround(app: AppBase) {
    const root = new Entity('Site ground');
    app.root.addChild(root);
    const front = new StandardMaterial();
    front.diffuse = new Color().fromString('#B8AA91');
    front.gloss = 0;
    front.update();
    const shared = new StandardMaterial();
    shared.diffuse = new Color().fromString('#71866A');
    shared.gloss = 0;
    shared.update();
    const planes = new Map<SiteSide, Entity>();
    for (const side of sides) {
        const e = new Entity(`${side} yard`);
        e.addComponent('render', { type: 'plane', material: side === 'front' ? front : shared });
        root.addChild(e);
        planes.set(side, e);
    }
    let layout: Layout | undefined;
    const draw = () => {
        if (!layout) return;
        const p = layout.property;
        const pts = [
            new Vec3(p.minX, 25, p.minZ),
            new Vec3(p.maxX, 25, p.minZ),
            new Vec3(p.maxX, 25, p.maxZ),
            new Vec3(p.minX, 25, p.maxZ)
        ];
        for (let i = 0; i < 4; i++) app.drawLine(pts[i], pts[(i + 1) % 4], new Color(0.23, 0.32, 0.28), true);
    };
    app.on('update', draw);
    return {
        update(next: Layout) {
            layout = next;
            for (const side of sides) {
                const r = next.regions[side],
                    e = planes.get(side)!;
                const w = r.maxX - r.minX,
                    d = r.maxZ - r.minZ;
                e.enabled = w > 0 && d > 0;
                if (e.enabled) {
                    e.setPosition((r.minX + r.maxX) / 2, 0, (r.minZ + r.maxZ) / 2);
                    e.setLocalScale(w, 1, d);
                }
            }
        },
        destroy() {
            app.off('update', draw);
            root.destroy();
            front.destroy();
            shared.destroy();
        }
    };
}
