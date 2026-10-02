import { summarizeGlazingParts } from '../products/parametric-engine/varenda/glazing-solver.ts';
import { summarizeRafterStandParts } from '../products/parametric-engine/varenda/varenda-solver.ts';
import type { VarendaViewSolution } from '../products/varenda/view/varenda-view.ts';

/** Existing engineering inspection output, independent of page controls. */
export function logProductDiagnostics(solution: VarendaViewSolution) {
    const { posts, glazing, endCaps, rafters } = solution;
    if (!glazing || !endCaps || !rafters) return;
    console.table(summarizeGlazingParts(glazing));
    // Count actual engineering instances even when hardware geometry is hidden.
    const endCapParts = new Map<string, Set<string>>();
    for (const part of [...endCaps.plates, ...endCaps.fasteners]) {
        const ids = endCapParts.get(part.catalogProductId) ?? new Set<string>();
        ids.add(part.instanceId);
        endCapParts.set(part.catalogProductId, ids);
    }
    console.table(
        [...endCapParts].map(([catalogProductId, ids]) => ({
            catalogProductId,
            quantity: ids.size,
            instanceIds: [...ids]
        }))
    );

    console.table(
        rafters.flatMap((rafter) =>
            summarizeRafterStandParts(rafter.stands).map((part) => ({
                rafterInstanceId: rafter.instanceId,
                ...part
            }))
        )
    );

    // POST HOLE MARKERS: local Z and source diameter only; no assembly transforms applied.
    console.table(
        posts[0].holeMarkers.map((marker) => ({
            part: marker.partInstanceId,
            marker: marker.markerId,
            localZMm: marker.centerMm.z,
            diameterMm: marker.sourceDiameterMm
        }))
    );
}
