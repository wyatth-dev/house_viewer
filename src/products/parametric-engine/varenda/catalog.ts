export type CatalogProduct = {
    catalogProductId: string;
    productName: string | null;
    kind: 'profile' | 'plate' | 'fastener' | 'assembly' | 'glass' | 'gasket';
    status: 'confirmed' | 'pending';
};

/** 内部目录键，不是厂家 SKU；不包含安装位置或用途。 */
export const varendaCatalog = {

    gutterFixed: { catalogProductId: 'varenda-gutter-fixed', productName: null, kind: 'profile', status: 'pending' },
    gutterMoving: { catalogProductId: 'varenda-gutter-moving', productName: null, kind: 'profile', status: 'pending' },
    wallpieceFixed: { catalogProductId: 'varenda-wallpiece-fixed', productName: null, kind: 'profile', status: 'pending' },
    wallpieceMoving: { catalogProductId: 'varenda-wallpiece-moving', productName: null, kind: 'profile', status: 'pending' },
    rafterRegular: { catalogProductId: 'varenda-rafter-regular', productName: null, kind: 'profile', status: 'pending' },
    rafterEnd: { catalogProductId: 'varenda-rafter-end', productName: null, kind: 'profile', status: 'pending' },
    rafterEndCap: {
        catalogProductId: 'varenda-rafter-endcap',
        productName: '5140010020 - Veranda Rafter End Cap v2',
        kind: 'plate',
        status: 'pending'
    },
    gutterEndCap: {
        catalogProductId: 'varenda-gutter-endcap',
        productName: '5140010010 Veranda ring beam End Cap',
        kind: 'plate',
        status: 'pending'
    },
    wallPieceEndCap: {
        catalogProductId: 'varenda-wallpiece-endcap',
        productName: '5140010015 - Veranda Wallplate End Cap v2',
        kind: 'plate',
        status: 'pending'
    },
    screwWaferHead4_2x16: {
        catalogProductId: 'fastener-wafer-head-self-drilling-4-2-16',
        productName: '4.2x16mm wafer head Self Drilling Screw v1',
        kind: 'fastener',
        status: 'pending'
    },

    glazingSealGasket: {
        catalogProductId: 'varenda-glazing-seal-gasket',
        productName: 'Glazing Seal Gasket',
        kind: 'gasket',
        status: 'pending'
    },
    wallPlateTopSealGasket: {
        catalogProductId: 'varenda-wallplate-top-seal-gasket',
        productName: 'Wallplate Top Seal Gasket',
        kind: 'gasket',
        status: 'pending'
    },
    glassPanel: {
        catalogProductId: 'varenda-glass-panel',
        productName: null,
        kind: 'glass',
        status: 'pending'
    },

    glazingSupportGasket: {
        catalogProductId: 'varenda-glazing-support-gasket',
        productName: 'Glazing Support Gasket',
        kind: 'gasket',
        status: 'pending'
    },

    glazingWedgeGasketA: {
        catalogProductId: 'varenda-glazing-wedge-gasket-a',
        productName: 'Glazing Wedge Gasket A',
        kind: 'gasket',
        status: 'pending'
    },

    glazingWedgeGasketB: {
        catalogProductId: 'varenda-glazing-wedge-gasket-b',
        productName: 'Glazing Wedge Gasket B',
        kind: 'gasket',
        status: 'pending'
    },

    postProfile: {
        catalogProductId: 'varenda-post-profile',
        productName: null,
        kind: 'profile',
        status: 'pending'
    },

    footplate: {
        catalogProductId: 'varenda-footplate',
        productName: null,
        kind: 'assembly',
        status: 'pending'
    },

    rafterFixingPlate: {
        catalogProductId: 'varenda-rafter-fixing-plate',
        productName: '5130010010 - Veranda Rafter Fixing Plate v3 v2(Mirror)',
        kind: 'plate',
        status: 'pending'
    },

    rafterStandBolt: {
        catalogProductId: 'varenda-rafter-stand-bolt',
        productName: '91180A530_Medium-Strength Class 8.8 Steel Hex Head Screw',
        kind: 'fastener',
        status: 'pending'
    },

    rafterStandNut: {
        catalogProductId: 'varenda-rafter-stand-nut',
        productName: 'Hexagon Nut BS EN 14399-8 - M8 Stainless Steel A2 Plain v1',
        kind: 'fastener',
        status: 'pending'
    },

    screwM6x16Din7500cA2: {
        catalogProductId: 'fastener-m6-16-din7500c-a2-v1',
        productName: 'M6 x 16mm Pozi Pan Head Thread Forming Screws (DIN 7500C) - Stainless Steel (A2) v1',
        kind: 'fastener',
        status: 'confirmed'
    }
} as const satisfies Record<string, CatalogProduct>;
