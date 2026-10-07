import { buildComponentData } from './component-data.ts';
import { varendaCatalog } from './catalog.ts';
import { solveColumnFasteners } from './column-fasteners.ts';
import { varendaDatums } from './datums.ts';
import { solveGlazing } from './glazing-solver.ts';
import type { GlazingSolution } from './glazing-solver.ts';
import type { MachiningInventory } from './machining.ts';
import { buildMachiningInventory } from './machining.ts';
import type { VarendaParams } from './parameters.ts';
import {
    solveColumnLayout,
    solveFootings,
    solvePosts,
    solveGutterLayout,
    solveWallPieceLayout,
    solveRoofSlope,
    solveRafters,
    solveRailEndCaps,
    solveRafterEndCaps
} from './varenda-solver.ts';
import type { FootingSolution, PostInstance, GutterLayout, WallPieceLayout } from './varenda-solver.ts';

/** Engineering data shared by list and renderer; no rendering dependency. */
export type VarendaGeometry = Readonly<{
    ringbeamClips?: readonly Readonly<{
        instanceId: string;
        catalogProductId: string;
        lengthMm: number;
        ownerInstanceId: 'gutter-fixed';
        modelNodeIndex: number;
    }>[];
    machining?: MachiningInventory;
    footings: FootingSolution;
    posts: readonly PostInstance[];
    gutter: GutterLayout;
    wallPiece: WallPieceLayout;
    roofSlope: Readonly<{ slopeDegrees: number }>;
    rafters?: ReturnType<typeof solveRafters>;
    endCaps?: ReturnType<typeof solveRailEndCaps>;
    rafterEndCaps?: ReturnType<typeof solveRafterEndCaps>;
    glazing?: GlazingSolution;
    columnFasteners?: ReturnType<typeof solveColumnFasteners>;
}>;
export type VarendaSolution = ReturnType<typeof solveVarenda>;
export function solveVarenda(params: Readonly<VarendaParams>) {
    const columnLayout = solveColumnLayout(params);
    const gutter = solveGutterLayout(params);
    const wallPiece = solveWallPieceLayout(params);
    const rafters = solveRafters(params);
    const footings = solveFootings(columnLayout, varendaDatums);
    const posts = solvePosts(columnLayout, params, varendaDatums);
    const solution = {
        columnLayout,
        footings,
        posts,
        columnFasteners: solveColumnFasteners(posts, footings),
        gutter,
        ringbeamClips: [0, 1].map(modelNodeIndex => ({
            instanceId: `gutter-ringbeam-clip-${modelNodeIndex + 1}`,
            catalogProductId: varendaCatalog.ringbeamClip.catalogProductId,
            lengthMm: gutter.lengthMm,
            ownerInstanceId: 'gutter-fixed' as const,
            modelNodeIndex
        })),
        wallPiece,
        rafters,
        roofSlope: solveRoofSlope(params),
        endCaps: solveRailEndCaps(gutter, wallPiece),
        rafterEndCaps: solveRafterEndCaps(rafters),
        glazing: solveGlazing(params, rafters)
    };
    const geometry = { ...solution, machining: buildMachiningInventory(solution) };
    return { ...geometry, componentData: buildComponentData(geometry) };
}
