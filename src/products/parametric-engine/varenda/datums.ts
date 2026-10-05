/** Measured source assets: footplate-source.3dm and post-source.3dm. All lengths in mm. */
export type VarendaDatums = Readonly<{
    /** Footplate bottom elevation above the product ground datum. */
    footingBaseZMm: number;
    /** Post bottom sits on the 5 mm footplate; this is an engineering datum. */
    postBaseZMm: number;
    /** Exported post-body profile spans 0..95 mm along its height axis. */
    postSourceLengthMm: number;
    /** Actual X width of the post section. */
    postWidthMm: number;
    /** Actual X width of the centered footplate bottom plate. */
    footplateWidthMm: number;
    /** Actual Y depth of the centered footplate bottom plate. */
    footplateDepthMm: number;
    /** Actual Y depth of the post section. */
    postDepthMm: number;
}>;

export const varendaDatums: VarendaDatums = Object.freeze({
    footingBaseZMm: 0,
    postBaseZMm: 5,
    postSourceLengthMm: 95,
    postWidthMm: 80,
    footplateWidthMm: 160,
    footplateDepthMm: 150,
    postDepthMm: 100
});

export type PostHoleDatum = {
    markerId: string;
    faceId: 'x-positive' | 'x-negative' | 'y-positive' | 'y-negative';
    anchor: 'bottom' | 'top';
    xMm: number;
    yMm: number;
    zOffsetMm: number;
    sourceDiameterMm: number;
};

/** 圆曲线实测基准；尚未确认贯穿壁数或加工深度。 */
export const postHoleDatums: readonly PostHoleDatum[] = [
    {
        markerId: 'bottom-x-positive-1',
        faceId: 'x-positive',
        anchor: 'bottom',
        xMm: 40,
        yMm: 16.7201959582,
        zOffsetMm: 25,
        sourceDiameterMm: 6
    },
    {
        markerId: 'bottom-x-positive-2',
        faceId: 'x-positive',
        anchor: 'bottom',
        xMm: 40,
        yMm: -15.2798040418,
        zOffsetMm: 25,
        sourceDiameterMm: 6
    },
    {
        markerId: 'bottom-x-positive-3',
        faceId: 'x-positive',
        anchor: 'bottom',
        xMm: 40,
        yMm: 0.720195958224,
        zOffsetMm: 50,
        sourceDiameterMm: 6
    },
    {
        markerId: 'bottom-x-negative-1',
        faceId: 'x-negative',
        anchor: 'bottom',
        xMm: -40,
        yMm: 16.7201959582,
        zOffsetMm: 25,
        sourceDiameterMm: 6
    },
    {
        markerId: 'bottom-x-negative-2',
        faceId: 'x-negative',
        anchor: 'bottom',
        xMm: -40,
        yMm: -15.2798040418,
        zOffsetMm: 25,
        sourceDiameterMm: 6
    },
    {
        markerId: 'bottom-x-negative-3',
        faceId: 'x-negative',
        anchor: 'bottom',
        xMm: -40,
        yMm: 0.720195958224,
        zOffsetMm: 50,
        sourceDiameterMm: 6
    },
    {
        markerId: 'top-y-positive-1',
        faceId: 'y-positive',
        anchor: 'top',
        xMm: -20,
        yMm: 50,
        zOffsetMm: -7.5,
        sourceDiameterMm: 5
    },
    {
        markerId: 'top-y-positive-2',
        faceId: 'y-positive',
        anchor: 'top',
        xMm: 20,
        yMm: 50,
        zOffsetMm: -7.5,
        sourceDiameterMm: 5
    },
    {
        markerId: 'top-y-negative-1',
        faceId: 'y-negative',
        anchor: 'top',
        xMm: -20,
        yMm: -50,
        zOffsetMm: -7.5,
        sourceDiameterMm: 5
    },
    {
        markerId: 'top-y-negative-2',
        faceId: 'y-negative',
        anchor: 'top',
        xMm: 20,
        yMm: -50,
        zOffsetMm: -7.5,
        sourceDiameterMm: 5
    }
];

/** 当前归零源素材的局部转轴；Rhino 坐标，单位 mm，轴向 +X。 */
export const roofJointDatums = {
    wallPiece: {
        pivotMm: {
            x: 0,
            y: -13,
            z: 16.5
        },
        sourceAngleDegrees: 0,
        // 固定板螺栓对准槽中心时，接触槽口两侧的 Z=28.99622020225 面。
        // Z=29.2 的另一段台面不在该板的安装接触区域内。
        bearingNormalOffsetMm: 12.49622020225,
        slotTangentOffsetMm: -30.1842903229,
    },
    gutter: {
        pivotMm: {
            x: 0,
            y: 22.5125710834,
            z: 49.5
        },
        sourceAngleDegrees: 0,
        bearingNormalOffsetMm: 12.4962202025,
        slotTangentOffsetMm: 19.05,
    },
    
} as const;


export const rafterDatums = {
    body: {
        sourceLengthMm: 100,
        lengthAxis: 'y',
        sourceEndsMm: { front: -50, rear: 50 },
        undersideZMm: 0,
        sectionWidthMm: 50
    },
    stand: {
        // 原点为板上接触面的中心。
        thicknessMm: 3,
        topZMm: 0,
        bottomZMm: -3,
        boltAxisXYMm: { x: -24.6, y: -3.75 },
        widthMm: 80,
        depthMm: 28.5
    },
    standSourcePlacement: {
        front: {
            positionMm: {
                x: -14.9679048686,
                y: -13.6978135741,
                z: 0
            },
            mirrorY: true
        },
        rear: {
            positionMm: {
                x: -14.9679048686,
                y: 35.75,
                z: 0
            },
            mirrorY: false
        }
    }
} as const;

/** glass-source.3dm: origin at the glass underside center; Rhino axes, mm. */
export const glassDatums = {
    source: {
        fileName: 'glass-source.3dm',
        widthMm: 380.8836918301446,
        lengthMm: 342.680931656579,
        lengthAxis: 'y',
        sourceEndsMm: {
            front: -171.34046582828947,
            rear: 171.34046582828955
        },
        undersideZMm: 0,
        sourceAngleDegrees: 0
    },
    // Measured 5-degree engineer bay, projected along the roof tangent.
    endOffsetFromRafterMm: {
        front: 0.002186428106,
        rear: 19.91000905688
    },
    thicknessMm: 6,
    // Installation offset from the rafter underside, not the glass source origin.
    undersideNormalOffsetMm: 9.200542,
    edgeOffsetMm: {
        regularRafter: 14,
        endRafter: 5.25
    }
} as const;

/** Endcap local origin: first hole axis on the contact face X=0; plate spans X=-2..0. */
export const railEndCapDatums = {
    gutter: {
        sourceFileName: 'gutter-endcap-source.3dm',
        thicknessMm: 2,
        anchorYZMm: { y: -59.9874289166, z: 8.5 },
        holes: [
            { y: 0, z: 0, diameterMm: 3.6 },
            { y: 0, z: 15.3, diameterMm: 3.6 },
            { y: 85, z: 15.3, diameterMm: 3.6 },
            { y: 85, z: 0, diameterMm: 3.6 },
            { y: 121, z: 15.3, diameterMm: 3.6 }
        ]
    },
    wallPiece: {
        sourceFileName: 'wallpiece-endcap-source.3dm',
        thicknessMm: 2,
        anchorYZMm: { y: 5.50171320116, z: 98 },
        holes: [
            { y: 0, z: 0, diameterMm: 3.6 },
            { y: 0, z: -57.4, diameterMm: 3.6 }
        ]
    }
} as const;

/** Side gasket assets use the rafter underside center, canonical +X side, length 100 mm. */
export const glazingGasketDatums = {
    sideSourceFileName: 'rafter-source.3dm',
    sideSourceLengthMm: 100,
    sideSourceEndsMm: { front: -50, rear: 50 },
    // Independently verified against glass-source and both rafter sources.
    supportTopZMm: 9.200542,
    sourceGlassRightGasketCorrectionMm: 8.75
} as const;

/** Origin: left upper screw axis on the contact plane; +Y points into the front cut. */
export const rafterEndCapDatums = {
    thicknessMm: 2,
    anchorXZMm: { x: -20.5, z: 30.2 },
    holes: [
        { x: 0, z: 0, diameterMm: 3.6 },
        { x: 41, z: 0, diameterMm: 3.6 },
        { x: 20.488998291600982, z: -25.4, diameterMm: 3.6 }
    ]
} as const;
