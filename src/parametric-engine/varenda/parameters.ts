// Parameters and defaults
export type VarendaParams = {
    widthMm: number;
    depthMm: number;
    wallHeightMm: number;
    undersideHeightMm: number;
    postInterval: number;
    rafterInterval: number;
};

export const VarendaConvention = {
    footPlate: 'varenda-footplate'
} as const;

export const defaultVarendaParams: Readonly<VarendaParams> = {
    widthMm: 4000,
    depthMm: 2000,
    wallHeightMm: 2500,
    undersideHeightMm: 1600,
    postInterval: 1000,
    rafterInterval: 500
};
