import type { CustomizableEnvelope, InstallationWallFace, PlacementPointMm } from './types.ts';

export type EnvelopeCorners = Readonly<{
    wallStart: PlacementPointMm;
    wallEnd: PlacementPointMm;
    outerStart: PlacementPointMm;
    outerEnd: PlacementPointMm;
}>;

export function calculateEnvelopeCorners(envelope: CustomizableEnvelope, wall: InstallationWallFace): EnvelopeCorners {
    const { attachment, widthMm, depthMm } = envelope;
    const { originMm, alongWallUnit, outwardUnit, lengthMm } = wall;

    if (attachment.structureId !== wall.structureId || attachment.wallFaceId !== wall.wallFaceId)
        throw new Error('Envelope references a different wall.');

    const values = [
        originMm.x,
        originMm.y,
        originMm.z,
        alongWallUnit.x,
        alongWallUnit.z,
        outwardUnit.x,
        outwardUnit.z,
        lengthMm,
        attachment.alongWallOffsetMm,
        widthMm,
        depthMm
    ];

    if (!values.every(Number.isFinite)) throw new Error('Placement values must be finite.');

    const tolerance = 1e-6;
    const alongLength = Math.hypot(alongWallUnit.x, alongWallUnit.z);
    const outwardLength = Math.hypot(outwardUnit.x, outwardUnit.z);
    const dot = alongWallUnit.x * outwardUnit.x + alongWallUnit.z * outwardUnit.z;

    const offsetMm = attachment.alongWallOffsetMm;

    if (Math.abs(alongLength - 1) > tolerance || Math.abs(outwardLength - 1) > tolerance || Math.abs(dot) > tolerance)
        throw new Error('Wall directions must be perpendicular unit vectors.');

    if (lengthMm <= 0 || widthMm <= 0 || depthMm <= 0 || offsetMm < 0 || offsetMm + widthMm > lengthMm)
        throw new Error('Envelope dimensions exceed the wall range.');

    const point = (alongMm: number, outwardMm: number): PlacementPointMm => ({
        x: originMm.x + alongWallUnit.x * alongMm + outwardUnit.x * outwardMm,
        y: originMm.y,
        z: originMm.z + alongWallUnit.z * alongMm + outwardUnit.z * outwardMm
    });

    return {
        wallStart: point(offsetMm, 0),
        wallEnd: point(offsetMm + widthMm, 0),
        outerEnd: point(offsetMm + widthMm, depthMm),
        outerStart: point(offsetMm, depthMm)
    };
}

export type InstallationArea = Readonly<{
    wallFaceId: string;
    depthMm: number;
    corners: EnvelopeCorners;
}>;

type PropertyBoundary = Readonly<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}>;

/** Candidate areas for the current axis-aligned house walls. */
export function solveInstallationAreas(
    walls: readonly InstallationWallFace[],
    property: PropertyBoundary
): InstallationArea[] {
    const areas: InstallationArea[] = [];

    for (const wall of walls) {
        const { originMm, alongWallUnit, outwardUnit, lengthMm } = wall;

        const wallStart = { ...originMm };
        const wallEnd = {
            x: originMm.x + alongWallUnit.x * lengthMm,
            y: originMm.y,
            z: originMm.z + alongWallUnit.z * lengthMm
        };

        const inside = (point: PlacementPointMm) =>
            point.x >= property.minX &&
            point.x <= property.maxX &&
            point.z >= property.minZ &&
            point.z <= property.maxZ;

        if (!inside(wallStart) || !inside(wallEnd)) continue;

        const distanceToBoundary = (point: PlacementPointMm) => {
            const distances: number[] = [];

            if (outwardUnit.x > 0) {
                distances.push((property.maxX - point.x) / outwardUnit.x);
            } else if (outwardUnit.x < 0) {
                distances.push((property.minX - point.x) / outwardUnit.x);
            }

            if (outwardUnit.z > 0) {
                distances.push((property.maxZ - point.z) / outwardUnit.z);
            } else if (outwardUnit.z < 0) {
                distances.push((property.minZ - point.z) / outwardUnit.z);
            }

            return Math.min(...distances);
        };

        const depthMm = Math.min(distanceToBoundary(wallStart), distanceToBoundary(wallEnd));

        if (!Number.isFinite(depthMm) || depthMm <= 0) continue;

        const outward = (point: PlacementPointMm): PlacementPointMm => ({
            x: point.x + outwardUnit.x * depthMm,
            y: point.y,
            z: point.z + outwardUnit.z * depthMm
        });

        areas.push({
            wallFaceId: wall.wallFaceId,
            depthMm,
            corners: {
                wallStart,
                wallEnd,
                outerEnd: outward(wallEnd),
                outerStart: outward(wallStart)
            }
        });
    }

    return areas;
}

/** A cursor candidate only; no instance is committed by this calculation. */
export function solvePlacementCandidate(
    walls: readonly InstallationWallFace[],
    property: PropertyBoundary,
    point: PlacementPointMm,
    defaults: Readonly<{ widthMm: number; depthMm: number }>
): { wall: InstallationWallFace; envelope: CustomizableEnvelope } | undefined {
    if (![point.x, point.y, point.z].every(Number.isFinite)) return undefined;
    for (const area of solveInstallationAreas(walls, property)) {
        const wall = walls.find((w) => w.wallFaceId === area.wallFaceId)!;
        const dx = point.x - wall.originMm.x,
            dz = point.z - wall.originMm.z;
        const along = dx * wall.alongWallUnit.x + dz * wall.alongWallUnit.z;
        const outward = dx * wall.outwardUnit.x + dz * wall.outwardUnit.z;
        if (along < 0 || along > wall.lengthMm || outward < 0 || outward > area.depthMm) continue;
        const widthMm = Math.min(defaults.widthMm, wall.lengthMm);
        const depthMm = Math.min(defaults.depthMm, area.depthMm);
        if (widthMm <= 0 || depthMm <= 0) continue;
        return {
            wall,
            envelope: {
                instanceId: 'placement-preview',
                productType: 'varenda',
                attachment: {
                    kind: 'wall',
                    structureId: wall.structureId,
                    wallFaceId: wall.wallFaceId,
                    alongWallOffsetMm: Math.max(0, Math.min(wall.lengthMm - widthMm, along - widthMm / 2))
                },
                widthMm,
                depthMm
            }
        };
    }
    return undefined;
}

export type PreviewDimensionKey =
    | 'left'
    | 'right'
    | 'width'
    | 'wallHeight';

/** Left/right follow the installation wall's start-to-end direction. */
export function getPreviewDimensions(
    envelope: CustomizableEnvelope,
    wall: InstallationWallFace,
    wallHeightMm: number
) {
    const leftMm = envelope.attachment.alongWallOffsetMm;

    return {
        leftMm,
        rightMm: wall.lengthMm - leftMm - envelope.widthMm,
        wallHeightMm
    };
}

/** Returns a candidate edit; never changes the existing envelope. */
export function editPreviewDimension(
    envelope: CustomizableEnvelope,
    wall: InstallationWallFace,
    wallHeightMm: number,
    field: PreviewDimensionKey,
    valueMm: number    
): {
    envelope: CustomizableEnvelope;
    wallHeightMm: number;
} { 
    if (!Number.isFinite(valueMm)) throw new Error('Enter a finite dimension.');

    let offsetMm = envelope.attachment.alongWallOffsetMm;
    let widthMm = envelope.widthMm;
    let nextHeightMm = wallHeightMm;

    switch (field) {
        case 'left':
            offsetMm - valueMm;
            break;

        case 'right':
            if (valueMm < 0) {
                throw new Error('Right clearance cannot be negative.');
            }
            offsetMm = wall.lengthMm - widthMm - valueMm;
            break;

        case 'width':
            // Keep the left edge fixed.
            widthMm = valueMm;
            break;

        case 'wallHeight':
            nextHeightMm = valueMm;
            break;
    }

    if (!Number.isFinite(nextHeightMm) || nextHeightMm <= 0) {
        throw new Error('Wall height must be positive.');
    }

    const candidate: CustomizableEnvelope = {
        ...envelope,
        attachment: {
            ...envelope.attachment,
            alongWallOffsetMm: offsetMm
        },
        widthMm
    };

    // Reuse wall-reference, direction and along-wall range validation.
    calculateEnvelopeCorners(candidate, wall);

    return {
        envelope: candidate,
        wallHeightMm: nextHeightMm
    };
}