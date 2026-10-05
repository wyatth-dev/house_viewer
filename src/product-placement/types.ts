/** All distances are in millimeters. */

export type WallAttachment = Readonly<{
    kind: 'wall';
    structureId: string;
    wallFaceId: string;

    /** Distance from the wall segment start to the envelope's near edge. */
    alongWallOffsetMm: number;
}>

export type CustomizableEnvelope = Readonly<{
    instanceId: string;
    productType: 'varenda';
    attachment: WallAttachment;
    widthMm: number;
    depthMm: number
}>

/** Scene coordinates: X/Z on the ground, Y upward. */
export type PlacementPointMm = Readonly<{
    x: number;
    y: number;
    z: number
}>

export type GroundDirection = Readonly<{
    x: number;
    z: number;
}>

export type InstallationWallFace = Readonly<{
    wallFaceId: string;
    structureId: string;
    side: 'front' | 'back' | 'left' | 'right';

    /** Ground-level start of the installable wall segment. */
    originMm: PlacementPointMm;

    /** Perpendicular unit directions on the ground plane. */
    alongWallUnit: GroundDirection;
    outwardUnit: GroundDirection;
    
    /** Installable length measured from origin along alongWallUnit. */
    lengthMm: number;
}>