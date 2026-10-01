/** The six GH inputs. Every length is in mm; slope and part lengths are derived. */
export type VarendaParams = {
    /** Product width along local X. */
    widthMm: number;
    /** Wall-piece origin to post/gutter origin; outward is local -Y. */
    depthMm: number;
    /** Wall-piece origin elevation above the product ground datum. */
    wallHeightMm: number;
    /** Post top and gutter-origin elevation, not the cut length of the post. */
    undersideHeightMm: number;
    /** Fixed GH column pitch with equal residual margins. */
    postInterval: number;
    /** GH rafter pitch; edge constraints belong to the rafter solver. */
    rafterInterval: number;
};

// Asset identifiers
export const VarendaConvention = {
    footPlate: 'varenda-footplate'
} as const;

// Learning defaults, not certified manufacturing limits
export const defaultVarendaParams: Readonly<VarendaParams> = {
    widthMm: 4000,
    depthMm: 2000,
    wallHeightMm: 2500,
    undersideHeightMm: 1600,
    postInterval: 1000,
    rafterInterval: 500
};
