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
        wallPiece,
        rafters,
        roofSlope: solveRoofSlope(params),
        endCaps: solveRailEndCaps(gutter, wallPiece),
        rafterEndCaps: solveRafterEndCaps(rafters),
        glazing: solveGlazing(params, rafters)
    };
    return { ...solution, machining: buildMachiningInventory(solution) };
}
