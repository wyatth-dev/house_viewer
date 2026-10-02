import { varendaCatalog } from './catalog.ts';
import type { Connection, InstalledFastener, FootingSolution, PostInstance } from './varenda-solver.ts';

export type ColumnFastenerConnection = Connection & Readonly<{ columnId: string }>;
export type ColumnFastenerSolution = Readonly<{
    fasteners: readonly InstalledFastener[];
    connections: readonly ColumnFastenerConnection[];
}>;

/** Verified against engineer's Post definition and normalized post-source assembly.
 * Top locations contain overlapping M5/M6 source geometry: user selected M6 provisionally.
 * Preserve measured hole diameters; choosing a fastener does not redefine drilling data.
 */
export function solveColumnFasteners(
    posts: readonly PostInstance[],
    footings: FootingSolution
): ColumnFastenerSolution {
    const fasteners: InstalledFastener[] = [];
    const connections: ColumnFastenerConnection[] = [];
    for (const post of posts) {
        const footing = footings.assemblies.find((part) => part.columnId === post.columnId);
        if (!footing) throw new Error(`Missing footing for ${post.columnId}`);
        const holes = post.holeMarkers;
        for (const hole of holes) {
            const bottom = hole.markerId.startsWith('bottom-');
            const sameEnd = holes.filter((candidate) => candidate.markerId.startsWith(bottom ? 'bottom-' : 'top-'));
            const number = sameEnd.indexOf(hole) + 1;
            const instanceId = `${post.columnId}-${bottom ? 'footplate' : 'gutter'}-screw-${number}`;
            fasteners.push({
                instanceId,
                catalogProductId: varendaCatalog.screwM6x16Din7500cA2.catalogProductId,
                positionMm: {
                    x: post.positionMm.x + hole.centerMm.x,
                    y: post.positionMm.y + hole.centerMm.y,
                    z: post.positionMm.z + hole.centerMm.z
                },
                axisUnit: bottom
                    ? { x: hole.faceId === 'x-positive' ? -1 : 1, y: 0, z: 0 }
                    : { x: 0, y: hole.faceId === 'y-positive' ? -1 : 1, z: 0 }
            });
            connections.push({
                connectionId: `${post.columnId}-${bottom ? 'footplate' : 'gutter'}-connection-${hole.markerId}`,
                columnId: post.columnId,
                partInstanceIds: [post.instanceId, bottom ? footing.instanceId : 'gutter-fixed'],
                holeRefs: [{ partInstanceId: post.instanceId, operationId: hole.markerId }],
                fastenerInstanceIds: [instanceId],
                alignment: 'coaxial'
            });
        }
    }
    return { fasteners, connections };
}
