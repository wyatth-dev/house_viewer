import { varendaCatalog } from './catalog.ts';
import { 
    varendaDatums,
    railEndCapDatums,
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
    alignment: 'coaxial' | 'coincident-centers';
};

export type RailEndCapInstance = Readonly<{
    instanceId: string;
    catalogProductId: string;
    railRef: Readonly<{ instanceId: 'gutter' | 'wallpiece'; end: 'left' | 'right' }>;
    positionMm: ProductPointMm;
    mirrorX: boolean;
    thicknessMm: number;
    holes: readonly HoleOperation[];
}>;

/** Position is the screw axis at the underside of the head, against the plate outer face. */
export type RailEndCapFastener = FastenerInstance & Readonly<{
    positionMm: ProductPointMm;
    axisUnit: ProductPointMm;
}>;

/** A measured extrusion screw channel is an installation feature, not a drilling operation. */
export type RailEndCapConnection = Readonly<{
    connectionId: string;
    endCapHoleRef: HoleRef;
    railRef: Readonly<{ instanceId: 'gutter' | 'wallpiece'; end: 'left' | 'right'; featureId: string }>;
    fastenerInstanceId: string;
    alignment: 'coaxial';
}>;

/** 每块实际玻璃独立记录；尺寸沿屋面局部坐标测量。 */
export type GlassInstance = Readonly<{
    instanceId: string;
    catalogProductId: string;

    bayRef: Readonly<{
        leftRafterInstanceId: string;
        rightRafterInstanceId: string;
    }>;

    displayNumber: string;
    /** 玻璃实体中心，Rhino 产品坐标，单位 mm。 */
    positionMm: ProductPointMm;
    slopeRadians: number;

    widthMm: number;
    lengthMm: number;
    thicknessMm: number;
}>;

/** 每条实际胶条只建立一个实例，独立记录长度和安装姿态。 */
export type GasketInstance = Readonly<{
    instanceId: string;
    catalogProductId: string;

    role: 'support' | 'wedge-a' | 'wedge-b' | 'seal' | 'top-seal';
    /** Existing rail assets own their gasket geometry; never render it twice. */
    renderOwnerInstanceId?: 'gutter' | 'wallpiece';
    /** 胶条素材基准原点的安装位置，Rhino 产品坐标，单位 mm。 */
    positionMm: ProductPointMm;
    slopeRadians: number;
    mirrorX: boolean;
    mirrorY: boolean;

    /** 素材局部长度轴；只沿此轴改变长度，保持截面尺寸。 */
    lengthAxis: 'x' | 'y';
    lengthMm: number;
}>;

/** 一条记录引用实际零件，不重复创建玻璃或胶条。 */
export type GasketInstallation = Readonly<{
    installationId: string;
    gasketInstanceId: string;
    role: 'support' | 'wedge-a' | 'wedge-b' | 'seal' | 'top-seal';

    glassRef?: Readonly<{
        instanceId: string;
        edge: 'left' | 'right' | 'front' | 'rear';
    }>;

    supportRef: Readonly<{
        instanceId: string;
        feature:
            | Readonly<{ status: 'confirmed'; featureId: string }>
            | Readonly<{ status: 'pending' }>;
    }>;
}>;

export type ColumnLayout = {
    centersMm: readonly number[];
    columns: readonly { columnId: string; positionMm: ProductPointMm }[];
};

export type FootingAssembly = {
    instanceId: string;
    columnId: string;
    catalogProductId: typeof varendaCatalog.footplate.catalogProductId;
    positionMm: ProductPointMm;
};

export type FootingSolution = {
    centersMm: readonly number[];
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
export function calculateColumnCenters(
    widthMm: number,
    postIntervalMm: number,
    datums: VarendaDatums = varendaDatums
): number[] {
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

    const sectionWidthMm = Math.max(datums.postWidthMm, datums.footplateWidthMm);
    if (
        !Number.isFinite(datums.postWidthMm) || datums.postWidthMm <= 0 ||
        !Number.isFinite(datums.footplateWidthMm) || datums.footplateWidthMm <= 0 ||
        widthMm < sectionWidthMm
    ) throw new Error('Invalid column section width or installation width');

    const centersMm = Array.from({ length: gapCount + 1 }, (_, index) => start + index * postIntervalMm);
    const halfWidthMm = sectionWidthMm / 2;
    centersMm[0] = Math.max(centersMm[0], halfWidthMm);
    const last = centersMm.length - 1;
    centersMm[last] = Math.min(centersMm[last], widthMm - halfWidthMm);

    for (let index = 0; index < centersMm.length; index++) {
        if (
            centersMm[index] < halfWidthMm ||
            centersMm[index] > widthMm - halfWidthMm ||
            (index > 0 && centersMm[index] - centersMm[index - 1] < sectionWidthMm)
        ) throw new Error('Column sections exceed the installation width or overlap');
    }
    return centersMm;
}

// Shared layout: solve once and pass to each component solver
/** The outward footplate edge is at -depthMm; the gutter shares the post axis. */
export function solveFrontAxisYMm(
    params: Readonly<VarendaParams>,
    datums: VarendaDatums = varendaDatums
): number {
    if (
        !Number.isFinite(params.depthMm) ||
        !Number.isFinite(datums.footplateDepthMm) || datums.footplateDepthMm <= 0 ||
        !Number.isFinite(datums.postDepthMm) || datums.postDepthMm <= 0 ||
        datums.postDepthMm > datums.footplateDepthMm ||
        params.depthMm < datums.footplateDepthMm
    ) throw new Error('Post and footplate must fit within the site depth');

    return -params.depthMm + datums.footplateDepthMm / 2;
}

/** Product-local Rhino axes: X width, Z up, -Y outward. No rendering transforms. */
export function solveColumnLayout(
    params: Readonly<VarendaParams>,
    datums: VarendaDatums = varendaDatums
): ColumnLayout {
    const centersMm = calculateColumnCenters(params.widthMm, params.postInterval, datums);
    const frontYMm = solveFrontAxisYMm(params, datums);
    return {
        centersMm,
        columns: centersMm.map((x, index) => ({
            columnId: `column-${index + 1}`,
            positionMm: { x, y: frontYMm, z: 0 }
        }))
    };
}

// Component solvers
/** Consumes shared column layout; never independently recalculates column positions. */
export function solveFootings(layout: ColumnLayout, datums: VarendaDatums): FootingSolution {
    if (!Number.isFinite(datums.footingBaseZMm)) throw new Error('Footing base must be finite');
    return {
        centersMm: [...layout.centersMm],
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

export function solveGutterLayout(
    params: VarendaParams,
    datums: VarendaDatums = varendaDatums
): GutterLayout {
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
            y: solveFrontAxisYMm(params, datums),
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

/** Rigid endcaps remain outside the rail span; width continues to mean rail length. */
export function solveRailEndCaps(gutter: GutterLayout, wallPiece: WallPieceLayout) {
    const plates: RailEndCapInstance[] = [];
    const fasteners: RailEndCapFastener[] = [];
    const connections: RailEndCapConnection[] = [];
    const rails = [
        { instanceId: 'gutter' as const, layout: gutter, datum: railEndCapDatums.gutter, catalog: varendaCatalog.gutterEndCap },
        { instanceId: 'wallpiece' as const, layout: wallPiece, datum: railEndCapDatums.wallPiece, catalog: varendaCatalog.wallPieceEndCap }
    ];
    for (const rail of rails) {
        if (!Number.isFinite(rail.layout.lengthMm) || rail.layout.lengthMm <= 0 ||
            !Object.values(rail.layout.positionMm).every(Number.isFinite)) {
            throw new Error('Invalid rail endcap installation dimensions');
        }
        for (const end of ['left', 'right'] as const) {
            const mirrorX = end === 'right';
            const sign = mirrorX ? -1 : 1;
            const instanceId = `${rail.instanceId}-endcap-${end}`;
            const positionMm = {
                x: rail.layout.positionMm.x - sign * rail.layout.lengthMm / 2,
                y: rail.layout.positionMm.y + rail.datum.anchorYZMm.y,
                z: rail.layout.positionMm.z + rail.datum.anchorYZMm.z
            };
            const holes: HoleOperation[] = rail.datum.holes.map((hole, index) => ({
                operationId: `hole-${index + 1}`,
                faceId: 'contact-face',
                centerMm: { x: 0, y: hole.y, z: hole.z },
                axisUnit: { x: 1, y: 0, z: 0 },
                diameterMm: hole.diameterMm,
                extent: { kind: 'through', wallIds: ['endcap-plate'] }
            }));
            plates.push({ instanceId, catalogProductId: rail.catalog.catalogProductId,
                railRef: { instanceId: rail.instanceId, end }, positionMm, mirrorX,
                thicknessMm: rail.datum.thicknessMm, holes });
            for (const [index, hole] of holes.entries()) {
                const fastenerInstanceId = `${instanceId}-screw-${index + 1}`;
                fasteners.push({
                    instanceId: fastenerInstanceId,
                    catalogProductId: varendaCatalog.screwWaferHead4_2x16.catalogProductId,
                    positionMm: {
                        x: positionMm.x - sign * rail.datum.thicknessMm,
                        y: positionMm.y + hole.centerMm.y,
                        z: positionMm.z + hole.centerMm.z
                    },
                    axisUnit: { x: sign, y: 0, z: 0 }
                });
                connections.push({
                    connectionId: `${instanceId}-connection-${index + 1}`,
                    endCapHoleRef: { partInstanceId: instanceId, operationId: hole.operationId },
                    railRef: { instanceId: rail.instanceId, end, featureId: `screw-channel-${index + 1}` },
                    fastenerInstanceId,
                    alignment: 'coaxial'
                });
            }
        }
    }
    return { plates, fasteners, connections };
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
    params: Readonly<VarendaParams>,
    rafterInstanceId = 'rafter-center',
    centerXMm = params.widthMm / 2
) {
    const roof = solveRoofSupportPoints(params);
    const stand = rafterDatums.stand;
    const source = rafterDatums.standSourcePlacement;
    const thicknessMm = stand.thicknessMm;
    // 当前默认朝向：板的 +X 理论边缘与椽子的 +X 侧对齐。
    const standOffsetXMm =
        (rafterDatums.body.sectionWidthMm - stand.widthMm) / 2;

    const fitsWithinWidth = (x: number) =>
        Number.isFinite(x)
        && x - stand.widthMm / 2 >= 0
        && x + stand.widthMm / 2 <= params.widthMm;

    const defaultXMm = centerXMm + standOffsetXMm;
    const mirroredXMm = centerXMm - standOffsetXMm;
    const mirrorX = !fitsWithinWidth(defaultXMm);
    const standXMm = mirrorX ? mirroredXMm : defaultXMm;

    if (!fitsWithinWidth(standXMm)) {
        throw new Error('Rafter fixing plate exceeds the rail width');
    }

    const place = (end: 'front' | 'rear') => {
        const reference = source[end];
        const support = end === 'front'
            ? roof.gutter
            : roof.wallPiece;

        const boltY = reference.mirrorY
            ? -stand.boltAxisXYMm.y
            : stand.boltAxisXYMm.y;

        const instanceId = `${rafterInstanceId}-stand-${end}`;
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
            mirrorX,
            mirrorY: reference.mirrorY,
            positionMm: {
                x: standXMm,
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
    params: Readonly<VarendaParams>,
    instanceId = 'rafter-center',
    centerXMm = params.widthMm / 2
) {
    const roof = solveRoofSupportPoints(params);
    const stands = solveRafterStandPlacements(params, instanceId, centerXMm);
    const body = rafterDatums.body;
    const source = rafterDatums.standSourcePlacement;

    const endpoint = (end: 'front' | 'rear'): ProductPointMm => {
        const offsetMm =
            body.sourceEndsMm[end] - source[end].positionMm.y;
        const plate = stands[end].positionMm;

        return {
            x: centerXMm,
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
        instanceId: instanceId,
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

export function calculateRafterCenters(
    params: Readonly<VarendaParams>
): number[] {
    const { widthMm, rafterInterval } = params;
    const halfWidthMm = rafterDatums.body.sectionWidthMm / 2;
    
    if (
        !Number.isFinite(widthMm) ||
        !Number.isFinite(rafterInterval) ||
        rafterInterval <= 0 ||
        rafterInterval > widthMm ||
        widthMm < halfWidthMm * 2
    ) throw new Error('Invalid rafter width or interval');

    const spaces = Math.floor(widthMm / rafterInterval);
    const marginMm = (widthMm - spaces * rafterInterval) / 2;

    const centersMm = Array.from(
        { length: spaces + 1 },
        ( _, index ) => marginMm + index * rafterInterval
    );

    centersMm[0] = Math.max(centersMm[0], halfWidthMm);
    const last = centersMm.length - 1;
    centersMm[last] = Math.min(centersMm[last], widthMm - halfWidthMm);

    for (let index = 1; index < centersMm.length; index++) {
        if (
            centersMm[index] - centersMm[index - 1] < 
            rafterDatums.body.sectionWidthMm
        ) throw new Error('Adjacent rafter bodies overlap');
    }

    return centersMm;
}

export function solveRafters(
    params: Readonly<VarendaParams>
) {
    const centersMm = calculateRafterCenters(params);

    return centersMm.map((centerXMm, index) => {
        const isLeftEnd = index === 0;
        const isRightEnd = index === centersMm.length - 1;

        return {
            ...solveSingleRafter(
                params,
                `rafter-${index + 1}`,
                centerXMm
            ),
            bodyKind: isLeftEnd || isRightEnd
                ? 'end' as const
                : 'regular' as const,
            mirrorX: isRightEnd
        }
    });
}
