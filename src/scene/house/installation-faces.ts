import type { GroundDirection, InstallationWallFace } from '../../product-placement/types.ts';

function face(
    wallFaceId: string,
    side: InstallationWallFace['side'],
    x: number,
    z: number,
    lengthMm: number,
    alongWallUnit: GroundDirection,
    outwardUnit: GroundDirection
): InstallationWallFace {
    return {
        wallFaceId,
        structureId: 'house-1',
        side,
        originMm: { x, y: 0, z },
        lengthMm,
        alongWallUnit,
        outwardUnit
    };
}

/**
 * Measured from house-edit.glb wall meshes.
 * Front uses only the named Front wall in the latest Rhino export; the unnamed recess is excluded.
 * Recessed Back segment updated from the 2026-10-05 export.
 * Coordinates include the current house wrapper translation.
 * Valid for the current calibration: width 43000 mm, yaw 0.
 * Wall geometry only; attachment suitability still needs verification.
 */
export const houseInstallationFaces: readonly InstallationWallFace[] = [
    face('front-main', 'front', -500, 28500, 22000, { x: 1, z: 0 }, { x: 0, z: 1 }),
    face('back-main', 'back', 9500, -28500, 12000, { x: 1, z: 0 }, { x: 0, z: -1 }),
    face('back-recessed', 'back', -21506.79296875, -19500.0, 12006.75390625, { x: 1, z: 0 }, { x: 0, z: -1 }),
    face('left-main', 'left', -21500, -19500, 31500, { x: 0, z: 1 }, { x: -1, z: 0 }),
    face('right-main', 'right', 21500, -28500, 57000, { x: 0, z: 1 }, { x: 1, z: 0 })
];
