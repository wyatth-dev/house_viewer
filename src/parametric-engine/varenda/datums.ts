// Engineering datums (mm)
/** Measured source assets: footplate-source.3dm and post-source.3dm. All lengths in mm. */
export type VarendaDatums = Readonly<{
    footingBaseZMm: number;
    postBaseZMm: number;
    postSourceLengthMm: number;
}>;
export const varendaDatums: VarendaDatums = Object.freeze({
    footingBaseZMm: 0,
    postBaseZMm: 5,
    postSourceLengthMm: 95
});
