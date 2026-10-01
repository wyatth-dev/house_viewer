import type { VarendaDatums } from './datums.ts';
import { VarendaConvention } from './parameters.ts';
import type { VarendaParams } from './parameters.ts';

/** Varenda pure solvers. Product-local Rhino axes, lengths in mm. */

// GH column spacing
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

// Shared column layout
export type ProductPointMm = Readonly<{ x: number; y: number; z: number }>;
export type ColumnLayout = {
    centresMm: readonly number[];
    columns: readonly { columnId: string; positionMm: ProductPointMm }[];
};

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

// Footing assemblies
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
