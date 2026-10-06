import { Color, Entity, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { extractCreaseEdges } from './crease-edges.ts';

/** Static house geometry is processed once; lines follow the house visibility. */
export function createHouseEdges(app: AppBase, house: Entity) {
    const positions: number[] = [],
        indices: number[] = [];
    house.forEach((node) => {
        if (!(node instanceof Entity) || !node.render) return;
        for (const instance of node.render.meshInstances) {
            const local: number[] = [],
                triangles: number[] = [];
            instance.mesh.getPositions(local);
            instance.mesh.getIndices(triangles);
            const offset = positions.length / 3;
            const transform = instance.node.getWorldTransform();
            for (let i = 0; i < local.length; i += 3) {
                const p = transform.transformPoint(new Vec3(local[i], local[i + 1], local[i + 2]));
                positions.push(p.x, p.y, p.z);
            }
            for (const index of triangles) indices.push(offset + index);
        }
    });
    const lines: Vec3[] = [];
    for (const edge of extractCreaseEdges(positions, indices)) {
        // A small outward offset prevents coplanar depth flicker without visible separation.
        const normal = new Vec3();
        for (const n of edge.normals) normal.add(new Vec3(...n));
        normal.normalize().mulScalar(0.8);
        lines.push(new Vec3(...edge.start).add(normal), new Vec3(...edge.end).add(normal));
    }
    const color = new Color().fromString('#CFD5DB');
    const draw = () => {
        if (house.enabled && lines.length) app.drawLines(lines, color, true);
    };
    app.on('update', draw);
    return () => app.off('update', draw);
}
