/** Measured source assets: footplate-source.3dm and post-source.3dm. All lengths in mm. */
export type VarendaDatums = Readonly<{
    /** Footplate bottom elevation above the product ground datum. */
    footingBaseZMm: number;
    /** Post bottom sits on the 5 mm footplate; this is an engineering datum. */
    postBaseZMm: number;
    /** Exported post-body profile spans 0..95 mm along its height axis. */
    postSourceLengthMm: number;
}>;

export const varendaDatums: VarendaDatums = Object.freeze({
    footingBaseZMm: 0,
    postBaseZMm: 5,
    postSourceLengthMm: 95
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