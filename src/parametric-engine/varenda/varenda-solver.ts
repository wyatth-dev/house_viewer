import type { VarendaDatums } from './datums.ts';
import { VarendaConvention } from './parameters.ts';
import type { VarendaParams } from './parameters.ts';

/** Varenda pure solvers. Product-local Rhino axes, lengths in mm. */

// Result types
export type ProductPointMm = Readonly<{ x: number; y: number; z: number }>;
export type ColumnLayout = {
    centresMm: readonly number[];
    columns: readonly { columnId: string; positionMm: ProductPointMm }[];
};

export type FootingAssembly = {
    assemblyId: string;
    columnId: string;
    assetKey: typeof VarendaConvention.footPlate;
    positionMm: ProductPointMm;
};
export type FootingSolution = {
    centresMm: readonly number[];
    assemblies: FootingAssembly[];
};

export type PostInstance = {
    instanceId: string;
    columnId: string;
    positionMm: ProductPointMm;
    lengthMm: number;
};

// GH spacing formula
/** GH fixed pitch with equal residual margins; all lengths are mm. */
export function calculateColumnCentres(widthMm: number, postIntervalMm: number): number[] {
    if (
        !Number.isFinite(widthMm) ||
        !Number.isFinite(postIntervalMm) ||
        widthMm <= 0 ||
        postIntervalMm <= 0 ||
        postIntervalMm > widthMm
    ) {
        throw new Error('宽度与柱间距必须为正数，且柱间距不能大于宽度');
    }

    const remainder = widthMm % postIntervalMm;
    const gapCount = Math.round((widthMm - remainder) / postIntervalMm);
    const start = remainder / 2;

    return Array.from({ length: gapCount + 1 }, (_, index) => start + index * postIntervalMm);
}

// Shared layout: solve once and pass to each component solver
/** Product-local Rhino axes: X width, Z up, -Y outward. No rendering transforms. */
export function solveColumnLayout(params: Readonly<VarendaParams>): ColumnLayout {
    const centresMm = calculateColumnCentres(params.widthMm, params.postInterval);
    if (!Number.isFinite(params.depthMm) || params.depthMm <= 0) {
        throw new Error('Depth must be a positive number');
    }
    return {
        centresMm,
        columns: centresMm.map((x, index) => ({
            columnId: `column-${index + 1}`,
            positionMm: { x, y: -params.depthMm, z: 0 }
        }))
    };
}

// Component solvers
/** Consumes shared column layout; never independently recalculates column positions. */
export function solveFootings(layout: ColumnLayout, datums: VarendaDatums): FootingSolution {
    if (!Number.isFinite(datums.footingBaseZMm)) throw new Error('Footing base must be finite');
    return {
        centresMm: [...layout.centresMm],
        assemblies: layout.columns.map((column) => ({
            assemblyId: `footing-${column.columnId}`,
            columnId: column.columnId,
            assetKey: VarendaConvention.footPlate,
            positionMm: {
                ...column.positionMm,
                z: column.positionMm.z + datums.footingBaseZMm
            }
        }))
    };
}

/** Shares column identities; only undersideHeight and the installation datum set length. */
export function solvePosts(
    layout: ColumnLayout,
    params: Readonly<VarendaParams>,
    datums: VarendaDatums
): PostInstance[] {
    const baseZMm = datums.postBaseZMm;
    const lengthMm = params.undersideHeightMm - baseZMm;

    if (!Number.isFinite(baseZMm) || !Number.isFinite(lengthMm) || lengthMm <= 0) {
        throw new Error('Post base and length must be finite positive numbers');
    }

    return layout.columns.map((column) => ({
        instanceId: `post-${column.columnId}`,
        columnId: column.columnId,
        positionMm: {
            x: column.positionMm.x,
            y: column.positionMm.y,
            z: baseZMm
        },
        lengthMm
    }));
}
