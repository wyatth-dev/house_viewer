import { layoutPosts } from './layout-posts.ts';
import type { VarendaParams } from './parameters.ts';
import { VarendaConvention } from './parameters.ts';

export type FootingAssembly = {
    assemblyId: string;
    assetKey: "varenda-footplate";
    positionMm: {
        x: number;
        y: number;
        z: number;
    };
};

export type FootingSolution = {
    centersMm: number[];
    assemblies: FootingAssembly[];
}

export function solveFootings(
    params: VarendaParams
): FootingSolution {
    const centersMm = layoutPosts(
        params.widthMm,
        params.postInterval
    );

    if (!Number.isFinite(params.depthMm) || params.depthMm <= 0) {
        throw new Error('Depth must be a positive number');
    }

    return {
        centersMm,
        assemblies: centersMm.map((x, index) => ({
            assemblyId: `footing-${index + 1}`,
            assetKey: VarendaConvention.footPlate,
            positionMm: {
                x,
                y: -params.depthMm,
                z: 0
            }
        }))
    }
}