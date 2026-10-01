import { varendaCatalog } from './catalog.ts';
import { postHoleDatums } from './datums.ts';
import type { PostHoleDatum, VarendaDatums } from './datums.ts';
import type { VarendaParams } from './parameters.ts';

/** Varenda pure solvers. Product-local Rhino axes, lengths in mm. */

// Result types
export type ProductPointMm = Readonly<{ x: number; y: number; z: number }>;
export type HoleOperation = {
    operationId: string;
    faceId: string;
    centerMm: ProductPointMm;
    axisUnit: ProductPointMm;
    diameterMm: number;

    extent:
        | { kind: 'through'; wallIds: readonly string[] }
        | { kind: 'blind'; depthMm: number }
        | { kind: 'pending' };
}

/** 一个孔由构件实例编号和孔编号共同定位。 */
export type HoleRef = {
    partInstanceId: string;
    operationId: string;
};

/** 一颗实际螺丝；连接多个构件也只统计一次。 */
export type FastenerInstance = {
    instanceId: string;
    catalogProductId: string;
};

/** 关系只保存在这里，构件和螺丝不重复存储反向引用。 */
export type Connection = {
    connectionId: string;
    holeRefs: readonly HoleRef[];
    fastenerInstanceIds: readonly string[];
    alignment: 'coaxial' | 'coincident-centres';
};

export type ColumnLayout = {
    centresMm: readonly number[];
    columns: readonly { columnId: string; positionMm: ProductPointMm }[];
};

export type FootingAssembly = {
    instanceId: string;
    columnId: string;
    catalogProductId: typeof varendaCatalog.footplate.catalogProductId;
    positionMm: ProductPointMm;
};

export type FootingSolution = {
    centresMm: readonly number[];
    assemblies: FootingAssembly[];
};

export type PostInstance = {
    instanceId: string;
    columnId: string;
    catalogProductId: typeof varendaCatalog.postProfile.catalogProductId;
    positionMm: ProductPointMm;
    lengthMm: number;
    holeMarkers: readonly PostHoleMarker[];
};

export type PostHoleMarker = {
    markerId: string;
    partInstanceId: string;
    faceId: PostHoleDatum['faceId'];
    centerMm: ProductPointMm;
    sourceDiameterMm: number;
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
            instanceId: `footing-${column.columnId}`,
            catalogProductId: varendaCatalog.footplate.catalogProductId,
            columnId: column.columnId,
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
    datums: VarendaDatums,
    holeDatums: readonly PostHoleDatum[] = postHoleDatums
): PostInstance[] {
    const baseZMm = datums.postBaseZMm;
    const lengthMm = params.undersideHeightMm - baseZMm;

    if (
        !Number.isFinite(baseZMm) ||
        !Number.isFinite(lengthMm) ||
        lengthMm <= 0
    ) {
        throw new Error('Post base and length must be finite positive numbers');
    }

    return layout.columns.map((column) => {
        const post = {
            instanceId: `post-${column.columnId}`,
            catalogProductId: varendaCatalog.postProfile.catalogProductId,
            columnId: column.columnId,
            positionMm: {
                x: column.positionMm.x,
                y: column.positionMm.y,
                z: baseZMm
            },
            lengthMm
        };

        return {
            ...post,
            holeMarkers: solvePostHoleMarkers(post, holeDatums)
        };
    });
}

/** 返回柱身加工局部坐标；不应用柱身缩放或装配平移。 */
export function solvePostHoleMarkers(
    post: Pick<PostInstance, 'instanceId' | 'lengthMm'>,
    holeDatums: readonly PostHoleDatum[]
): PostHoleMarker[] {
    return holeDatums.map((datum) => {
        const zMm =
            datum.anchor === 'bottom'
                ? datum.zOffsetMm
                : post.lengthMm + datum.zOffsetMm;

        const radiusMm = datum.sourceDiameterMm / 2;

        if (
            !Number.isFinite(zMm) ||
            !Number.isFinite(radiusMm) ||
            radiusMm <= 0 ||
            zMm - radiusMm < 0 ||
            zMm + radiusMm > post.lengthMm
        ) {
            throw new Error(
                `${post.instanceId}: ${datum.markerId} 超出柱身长度`
            );
        }

        return {
            markerId: datum.markerId,
            partInstanceId: post.instanceId,
            faceId: datum.faceId,
            centerMm: {
                x: datum.xMm,
                y: datum.yMm,
                z: zMm
            },
            sourceDiameterMm: datum.sourceDiameterMm
        };
    });
}