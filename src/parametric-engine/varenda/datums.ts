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
