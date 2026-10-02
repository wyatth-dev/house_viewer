import { varendaCatalog } from './catalog.ts';
import { 
    postHoleDatums, 
    roofJointDatums, 
    rafterDatums 
} from './datums.ts';
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

export type GutterLayout = Readonly<{
    positionMm: ProductPointMm;
    lengthMm: number;
}>

export type WallPieceLayout = Readonly<{
    positionMm: ProductPointMm;
    lengthMm: number;
}>

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

export function solveGutterLayout(params: VarendaParams): GutterLayout {
    const { widthMm, depthMm, undersideHeightMm } = params;

    if (
        ![widthMm, depthMm, undersideHeightMm].every(Number.isFinite) ||
        widthMm <= 0 ||
        depthMm <= 0 ||
        undersideHeightMm <= 0
    ) throw new Error('Gutter dimensions must be finite and positive');

    return {
        positionMm: {
            x: widthMm / 2,
            y: -depthMm,
            z: undersideHeightMm
        },
        lengthMm: widthMm,
    };
}          

export function solveWallPieceLayout(
    params: VarendaParams,
): WallPieceLayout {
    const { widthMm, wallHeightMm } = params;

    if (
        ![widthMm, wallHeightMm].every(Number.isFinite) ||
        widthMm <= 0 ||
        wallHeightMm <= 0
    ) throw new Error('Wall Piece dimensions must be finite and positive');

    return {
        positionMm: {
            x: widthMm / 2,
            y: 0,
            z: wallHeightMm
        },
        lengthMm: widthMm,
    }
}

export function solveRoofSlope(params: Readonly<VarendaParams>) {
    const wall = solveWallPieceLayout(params);
    const gutter = solveGutterLayout(params);
    const w = roofJointDatums.wallPiece;
    const g = roofJointDatums.gutter;

    const dy =
        wall.positionMm.y + w.pivotMm.y -
        gutter.positionMm.y - g.pivotMm.y;

    const dz =
        wall.positionMm.z + w.pivotMm.z -
        gutter.positionMm.z - g.pivotMm.z;

    const distance = Math.hypot(dy, dz);
    const deltaNormal =
        w.bearingNormalOffsetMm - g.bearingNormalOffsetMm;

    if (dy <= 0 || distance <= Math.abs(deltaNormal)) {
        throw new Error('No forward roof span exists');
    }

    const slopeRadians =
        Math.atan2(dz, dy) + Math.asin(deltaNormal / distance);

    return {
        slopeRadians,
        slopeDegrees: slopeRadians * 180 / Math.PI
    };
}

export function solveRoofSupportPoints(
    params: Readonly<VarendaParams>
) {
    const { slopeRadians } = solveRoofSlope(params);
    const c = Math.cos(slopeRadians);
    const s = Math.sin(slopeRadians);

    // Rhino 坐标：沿坡朝墙方向，以及承托面向上的法向。
    const tangentUnit = { x: 0, y: c, z: s };
    const normalUnit = { x: 0, y: -s, z: c };

    const supportPoint = (
        layout: GutterLayout | WallPieceLayout,
        joint: typeof roofJointDatums[
            keyof typeof roofJointDatums
        ]
    ): ProductPointMm => {
        const along = joint.slotTangentOffsetMm;
        const normal = joint.bearingNormalOffsetMm;

        return {
            x: layout.positionMm.x + joint.pivotMm.x,
            y: layout.positionMm.y + joint.pivotMm.y
                + c * along - s * normal,
            z: layout.positionMm.z + joint.pivotMm.z
                + s * along + c * normal
        };
    };

    return {
        slopeRadians,
        tangentUnit,
        normalUnit,
        gutter: supportPoint(
            solveGutterLayout(params),
            roofJointDatums.gutter
        ),
        wallPiece: supportPoint(
            solveWallPieceLayout(params),
            roofJointDatums.wallPiece
        )
    };
}

export function solveRafterStandPlacements(
    params: Readonly<VarendaParams>
) {
    const roof = solveRoofSupportPoints(params);
    const stand = rafterDatums.stand;
    const source = rafterDatums.standSourcePlacement;
    const thicknessMm = stand.thicknessMm;
    // 当前默认朝向：板的 +X 理论边缘与椽子的 +X 侧对齐。
    const standOffsetXMm =
        (rafterDatums.body.sectionWidthMm - stand.widthMm) / 2;

    const place = (end: 'front' | 'rear') => {
        const reference = source[end];
        const support = end === 'front'
            ? roof.gutter
            : roof.wallPiece;

        const boltY = reference.mirrorY
            ? -stand.boltAxisXYMm.y
            : stand.boltAxisXYMm.y;

        const instanceId = `rafter-stand-${end}`;
        const fasteners: FastenerInstance[] = [
            {
                instanceId: `${instanceId}-bolt`,
                catalogProductId: varendaCatalog.rafterStandBolt.catalogProductId
            },
            {
                instanceId: `${instanceId}-nut`,
                catalogProductId: varendaCatalog.rafterStandNut.catalogProductId
            }
        ];

        return {
            instanceId,
            catalogProductId: varendaCatalog.rafterFixingPlate.catalogProductId,
            fasteners,
            mirrorY: reference.mirrorY,
            positionMm: {
                x: support.x + standOffsetXMm,
                y: support.y
                    - boltY * roof.tangentUnit.y
                    + thicknessMm * roof.normalUnit.y,
                z: support.z
                    - boltY * roof.tangentUnit.z
                    + thicknessMm * roof.normalUnit.z
            }
        };
    };

    return {
        slopeRadians: roof.slopeRadians,
        front: place('front'),
        rear: place('rear')
    };
}

export function solveSingleRafter(
    params: Readonly<VarendaParams>
) {
    const roof = solveRoofSupportPoints(params);
    const stands = solveRafterStandPlacements(params);
    const body = rafterDatums.body;
    const source = rafterDatums.standSourcePlacement;

    const endpoint = (end: 'front' | 'rear'): ProductPointMm => {
        const offsetMm =
            body.sourceEndsMm[end] - source[end].positionMm.y;
        const plate = stands[end].positionMm;

        return {
            x: params.widthMm / 2,
            y: plate.y + offsetMm * roof.tangentUnit.y,
            z: plate.z + offsetMm * roof.tangentUnit.z
        };
    };

    const frontMm = endpoint('front');
    const rearMm = endpoint('rear');
    const dy = rearMm.y - frontMm.y;
    const dz = rearMm.z - frontMm.z;
    const lengthMm =
        dy * roof.tangentUnit.y + dz * roof.tangentUnit.z;

    if (!Number.isFinite(lengthMm) || lengthMm <= 0) {
        throw new Error('Rafter length must be finite and positive');
    }

    return {
        instanceId: 'rafter-centre',
        frontMm,
        rearMm,
        lengthMm,
        positionMm: {
            x: (frontMm.x + rearMm.x) / 2,
            y: (frontMm.y + rearMm.y) / 2,
            z: (frontMm.z + rearMm.z) / 2
        },
        slopeRadians: roof.slopeRadians,
        stands
    };
}

export function summarizeRafterStandParts(
    stands: ReturnType<typeof solveRafterStandPlacements>
) {
    const groups = new Map<string, Set<string>>();

    for (const plate of [stands.front, stands.rear]) {
        for (const part of [plate, ...plate.fasteners]) {
            let ids = groups.get(part.catalogProductId);

            if (!ids) {
                ids = new Set<string>();
                groups.set(part.catalogProductId, ids);
            }

            ids.add(part.instanceId);
        }
    }

    return [...groups].map(([catalogProductId, ids]) => ({
        catalogProductId,
        quantity: ids.size,
        instanceIds: [...ids]
    }));
}
