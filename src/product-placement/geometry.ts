import type {
    CustomizableEnvelope,
    InstallationWallFace,
    PlacementPointMm
} from './types.ts';

export type EnvelopeCorners = Readonly<{
    wallStart: PlacementPointMm,
    wallEnd: PlacementPointMm,
    outerStart: PlacementPointMm,
    outerEnd: PlacementPointMm,
}>;

export function calculateEnvelopeCorners(
    envelope: CustomizableEnvelope,
    wall: InstallationWallFace
): EnvelopeCorners {
    const { attachment, widthMm, depthMm } = envelope;
    const { originMm, alongWallUnit, outwardUnit, lengthMm } = wall;

    if (
        attachment.structureId !== wall.structureId ||
        attachment.wallFaceId !== wall.wallFaceId
    ) throw new Error('Envelope references a different wall.');

    const values = [
        originMm.x, originMm.y, originMm.z,
        alongWallUnit.x, alongWallUnit.z,
        outwardUnit.x, outwardUnit.z,
        lengthMm, attachment.alongWallOffsetMm, widthMm, depthMm
    ];

    if (!values.every(Number.isFinite)) throw new Error('Placement values must be finite.');

    const tolerance = 1e-6;
    const alongLength = Math.hypot(alongWallUnit.x, alongWallUnit.z);
    const outwardLength = Math.hypot(outwardUnit.x, outwardUnit.z);
    const dot =
        alongWallUnit.x * outwardUnit.x +
        alongWallUnit.z * outwardUnit.z;

    const offsetMm = attachment.alongWallOffsetMm;

    if (
        Math.abs(alongLength - 1) > tolerance ||
        Math.abs(outwardLength - 1) > tolerance ||
        Math.abs(dot) > tolerance
    ) throw new Error('Wall directions must be perpendicular unit vectors.');

    const point = (alongMm: number, outwardMm: number): PlacementPointMm => ({
        x: originMm.x +
            alongWallUnit.x * alongMm +
            outwardUnit.x * outwardMm,
        y: originMm.y,
        z: originMm.z +
            alongWallUnit.z * alongMm +
            outwardUnit.z * outwardMm
    });

    return {
        wallStart: point(offsetMm, 0),
        wallEnd: point(offsetMm + widthMm, 0),
        outerEnd: point(offsetMm + widthMm, depthMm),
        outerStart: point(offsetMm, depthMm)
    };
}
