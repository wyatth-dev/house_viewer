// Rendering assets are independent of engineering catalog identities.
export const varendaAssets = {
    glazingSupport: '/models/varenda/glazing-support.glb',
    glazingWedgeA: '/models/varenda/glazing-wedge-a.glb',
    glazingWedgeB: '/models/varenda/glazing-wedge-b.glb',
    glassPanel: '/models/varenda/glass-panel.glb',
    //footplate
    footplate: '/models/varenda/footplate.glb',
    postBody: '/models/varenda/post-body.glb',
    postSourceLengthMm: 95,
    // gutter
    gutterFixed: '/models/varenda/gutter-fixed.glb',
    gutterMoving: '/models/varenda/gutter-moving.glb',
    gutterSourceLengthMm: 100,
    gutterEndCap: '/models/varenda/gutter-endcap.glb',
    // wall piece
    wallPieceFixed: '/models/varenda/wallpiece-fixed.glb',
    wallPieceMoving: '/models/varenda/wallpiece-moving.glb',
    wallPieceSourceLengthMm: 100,
    wallPieceEndCap: '/models/varenda/wallpiece-endcap.glb',
    // rafter
    rafterEndCap: '/models/varenda/rafter-endcap.glb',
    rafterBody: '/models/varenda/rafter-body.glb',
    rafterEndBody: '/models/varenda/rafter-end-body.glb',
    rafterStand: '/models/varenda/rafter-stand.glb'
} as const;

/** Hardware geometry references engineer seating planes; local Rhino +Y is the screw axis. */
export const hardwareAssets: Readonly<Record<string, string>> = {
    'fastener-wafer-head-self-drilling-4-2-16': '/models/varenda/wafer-screw.glb',
    'fastener-m6-16-din7500c-a2-v1': '/models/varenda/m6-screw.glb',
    'varenda-rafter-stand-bolt': '/models/varenda/stand-bolt.glb',
    'varenda-rafter-stand-nut': '/models/varenda/stand-nut.glb'
};
