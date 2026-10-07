export type CatalogProduct = {
    catalogProductId: string;
    manufacturerCode: string | null;
    name: string;
    kind: 'profile' | 'plate' | 'fastener' | 'glass' | 'gasket';
    status: 'confirmed' | 'pending';
};

/** Product definitions only; containment and connections are stored separately. */
export const varendaCatalog = {
    ringbeamClip: {
        catalogProductId: "varenda-ringbeam-clip",
        manufacturerCode: "SM5360/KL005/6.5",
        name: "Veranda Ringbeam Clip",
        kind: "profile",
        status: "confirmed",
    },
    gutterFixed: {
        catalogProductId: "varenda-gutter-fixed",
        manufacturerCode: "5110010010",
        name: "Veranda Ringbeam",
        kind: "profile",
        status: "confirmed",
    },
    gutterMoving: {
        catalogProductId: "varenda-gutter-moving",
        manufacturerCode: "5110010015",
        name: "Veranda Ringbeam Swivel",
        kind: "profile",
        status: "confirmed",
    },
    wallpieceFixed: {
        catalogProductId: "varenda-wallpiece-fixed",
        manufacturerCode: "5110010030",
        name: "Veranda Wallplate",
        kind: "profile",
        status: "pending",
    },
    wallpieceMoving: {
        catalogProductId: "varenda-wallpiece-moving",
        manufacturerCode: "5110010035",
        name: "Veranda Wallplate Swivel",
        kind: "profile",
        status: "confirmed",
    },
    rafterRegular: {
        catalogProductId: "varenda-rafter-regular",
        manufacturerCode: "5110010020",
        name: "Veranda Rafter",
        kind: "profile",
        status: "confirmed",
    },
    rafterEnd: {
        catalogProductId: "varenda-rafter-end",
        manufacturerCode: "5110010025",
        name: "Gable Rafter",
        kind: "profile",
        status: "confirmed",
    },
    rafterEndCap: {
        catalogProductId: "varenda-rafter-endcap",
        manufacturerCode: "5140010020",
        name: "Veranda Rafter End Clip",
        kind: "plate",
        status: "confirmed",
    },
    gutterEndCap: {
        catalogProductId: "varenda-gutter-endcap",
        manufacturerCode: "5140010010",
        name: "Veranda Ringbeam End Cap",
        kind: "plate",
        status: "confirmed",
    },
    wallPieceEndCap: {
        catalogProductId: "varenda-wallpiece-endcap",
        manufacturerCode: "5140010015",
        name: "Veranda Wallplate End Clip",
        kind: "plate",
        status: "confirmed",
    },
    screwWaferHead4_2x16: {
        catalogProductId: "fastener-wafer-head-self-drilling-4-2-16",
        manufacturerCode: null,
        name: "4.2x16mm wafer head Self Drilling Screw v1",
        kind: "fastener",
        status: "pending",
    },
    glazingSealGasket: {
        catalogProductId: "varenda-glazing-seal-gasket",
        manufacturerCode: "5120010020",
        name: "Glazing Flipper Gasket",
        kind: "gasket",
        status: "confirmed",
    },
    wallPlateTopSealGasket: {
        catalogProductId: "varenda-wallplate-top-seal-gasket",
        manufacturerCode: "5120010010",
        name: "Wallplate Top Seal Gasket",
        kind: "gasket",
        status: "confirmed",
    },
    glassPanel: {
        catalogProductId: "varenda-glass-panel",
        manufacturerCode: null,
        name: "Glass Panel",
        kind: "glass",
        status: "pending",
    },
    glazingSupportGasket: {
        catalogProductId: "varenda-glazing-support-gasket",
        manufacturerCode: "5120010015",
        name: "Glazing Support Gasket",
        kind: "gasket",
        status: "confirmed",
    },
    glazingWedgeGasket: {
        catalogProductId: "varenda-glazing-wedge-gasket",
        manufacturerCode: "5120010025",
        name: "Glazing Wedge Gasket",
        kind: "gasket",
        status: "confirmed",
    },
    postProfile: {
        catalogProductId: "varenda-post-profile",
        manufacturerCode: "5110010045",
        name: "Veranda Post",
        kind: "profile",
        status: "confirmed",
    },
    footplate: {
        catalogProductId: "varenda-footplate",
        manufacturerCode: "5130010015",
        name: "Veranda Foot Plate",
        kind: "plate",
        status: "confirmed",
    },
    rafterFixingPlate: {
        catalogProductId: "varenda-rafter-fixing-plate",
        manufacturerCode: "5130010010",
        name: "Veranda Rafter Fixing Plate",
        kind: "plate",
        status: "confirmed",
    },
    rafterStandBolt: {
        catalogProductId: "varenda-rafter-stand-bolt",
        manufacturerCode: null,
        name: "91180A530_Medium-Strength Class 8.8 Steel Hex Head Screw",
        kind: "fastener",
        status: "pending",
    },
    rafterStandNut: {
        catalogProductId: "varenda-rafter-stand-nut",
        manufacturerCode: null,
        name: "Hexagon Nut BS EN 14399-8 - M8 Stainless Steel A2 Plain v1",
        kind: "fastener",
        status: "pending",
    },
    screwM6x16Din7500cA2: {
        catalogProductId: "fastener-m6-16-din7500c-a2-v1",
        manufacturerCode: null,
        name: "M6 x 16mm Pozi Pan Head Thread Forming Screws (DIN 7500C) - Stainless Steel (A2) v1",
        kind: "fastener",
        status: "confirmed",
    },
} as const satisfies Record<string, CatalogProduct>;
