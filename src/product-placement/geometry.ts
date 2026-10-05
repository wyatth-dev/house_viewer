import type { VarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import type { Bounds3 } from '../shared/geometry/types.ts';

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
    property: PropertyBoundary,
    occupied: readonly CustomizableEnvelope[] = []
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

        let spans = [{ start: 0, end: lengthMm }];
        for (const envelope of occupied) {
            if (
                envelope.attachment.wallFaceId !== wall.wallFaceId ||
                envelope.attachment.structureId !== wall.structureId
            )
                continue;
            const start = envelope.attachment.alongWallOffsetMm;
            const end = start + envelope.widthMm;
            spans = spans.flatMap((span) => {
                if (end <= span.start || start >= span.end) return [span];
                return [
                    ...(start > span.start ? [{ start: span.start, end: start }] : []),
                    ...(end < span.end ? [{ start: end, end: span.end }] : [])
                ];
            });
        }
        const alongPoint = (offset: number) => ({
            x: originMm.x + alongWallUnit.x * offset,
            y: originMm.y,
            z: originMm.z + alongWallUnit.z * offset
        });
        for (const span of spans) {
            const start = alongPoint(span.start),
                end = alongPoint(span.end);
            areas.push({
                wallFaceId: wall.wallFaceId,
                depthMm,
                corners: {
                    wallStart: start,
                    wallEnd: end,
                    outerStart: outward(start),
                    outerEnd: outward(end)
                }
            });
        }
    }

    return areas;
}

/** A cursor candidate only; no instance is committed by this calculation. */
export function solvePlacementCandidate(
    walls: readonly InstallationWallFace[],
    property: PropertyBoundary,
    point: PlacementPointMm,
    defaults: Readonly<{ widthMm: number; depthMm: number }>,
    occupied: readonly CustomizableEnvelope[] = []
): { wall: InstallationWallFace; envelope: CustomizableEnvelope } | undefined {
    if (![point.x, point.y, point.z].every(Number.isFinite)) return undefined;
    for (const area of solveInstallationAreas(walls, property, occupied)) {
        const wall = walls.find((w) => w.wallFaceId === area.wallFaceId)!;
        const dx = point.x - wall.originMm.x,
            dz = point.z - wall.originMm.z;
        const along = dx * wall.alongWallUnit.x + dz * wall.alongWallUnit.z;
        const outward = dx * wall.outwardUnit.x + dz * wall.outwardUnit.z;
        const areaStart =
            (area.corners.wallStart.x - wall.originMm.x) * wall.alongWallUnit.x +
            (area.corners.wallStart.z - wall.originMm.z) * wall.alongWallUnit.z;
        const areaLength = Math.hypot(
            area.corners.wallEnd.x - area.corners.wallStart.x,
            area.corners.wallEnd.z - area.corners.wallStart.z
        );
        if (along < areaStart || along > areaStart + areaLength || outward < 0 || outward > area.depthMm) continue;
        const widthMm = Math.min(defaults.widthMm, areaLength);
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
                    alongWallOffsetMm: Math.max(
                        areaStart,
                        Math.min(areaStart + areaLength - widthMm, along - widthMm / 2)
                    )
                },
                widthMm,
                depthMm
            }
        };
    }
    return undefined;
}

export type PreviewDimensionKey = 'left' | 'right' | 'width' | 'wallHeight';

/** Left/right follow the installation wall's start-to-end direction. */
export function getPreviewDimensions(envelope: CustomizableEnvelope, wall: InstallationWallFace, wallHeightMm: number) {
    const leftMm = envelope.attachment.alongWallOffsetMm;

    return {
        leftMm,
        rightMm: wall.lengthMm - leftMm - envelope.widthMm,
        widthMm: envelope.widthMm,
        wallHeightMm
    };
}

/** Returns a candidate edit; never changes the existing envelope. */
export function editPreviewDimension(
    envelope: CustomizableEnvelope,
    wall: InstallationWallFace,
    wallHeightMm: number,
    field: PreviewDimensionKey,
    valueMm: number,
    locked: ReadonlySet<PreviewDimensionKey> = new Set()
): {
    envelope: CustomizableEnvelope;
    wallHeightMm: number;
} {
    if (!Number.isFinite(valueMm)) throw new Error('Enter a finite dimension.');

    const before = getPreviewDimensions(envelope, wall, wallHeightMm);
    if (locked.has(field) && Math.abs(before[`${field}Mm`] - valueMm) > 1e-6)
        throw new Error('This dimension is locked. Unlock it before editing.');
    let offsetMm = envelope.attachment.alongWallOffsetMm;
    let widthMm = envelope.widthMm;
    let nextHeightMm = wallHeightMm;
    const rightMm = wall.lengthMm - offsetMm - widthMm;

    switch (field) {
        case 'left':
            if (locked.has('right')) widthMm = wall.lengthMm - rightMm - valueMm;
            offsetMm = valueMm;
            break;

        case 'right':
            if (valueMm < 0) {
                throw new Error('Right clearance cannot be negative.');
            }
            if (locked.has('left')) widthMm = wall.lengthMm - offsetMm - valueMm;
            else offsetMm = wall.lengthMm - widthMm - valueMm;
            break;

        case 'width':
            widthMm = valueMm;
            if (locked.has('right')) offsetMm = wall.lengthMm - rightMm - widthMm;
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

    const after = getPreviewDimensions(candidate, wall, nextHeightMm);
    for (const key of locked)
        if (Math.abs(after[`${key}Mm`] - before[`${key}Mm`]) > 1e-6)
            throw new Error('Locked dimensions conflict with this edit. Unlock a related dimension first.');

    // Reuse wall-reference, direction and along-wall range validation.
    calculateEnvelopeCorners(candidate, wall);

    return {
        envelope: candidate,
        wallHeightMm: nextHeightMm
    };
}

/** Shared world anchors for annotation rendering and placement camera framing. */
export function getPlacementDimensionPoints(envelope: CustomizableEnvelope, wall: InstallationWallFace) {
    const corners = calculateEnvelopeCorners(envelope, wall);
    const offsetMm = envelope.depthMm + 600;
    const dimensionPoint = (point: PlacementPointMm): PlacementPointMm => ({
        x: point.x + wall.outwardUnit.x * offsetMm,
        y: point.y + 80,
        z: point.z + wall.outwardUnit.z * offsetMm
    });
    return {
        wallStart: dimensionPoint(wall.originMm),
        productStart: dimensionPoint(corners.wallStart),
        productEnd: dimensionPoint(corners.wallEnd),
        wallEnd: dimensionPoint({
            x: wall.originMm.x + wall.alongWallUnit.x * wall.lengthMm,
            y: wall.originMm.y,
            z: wall.originMm.z + wall.alongWallUnit.z * wall.lengthMm
        })
    };
}

/** Frame the selected product and its actual dimension anchors together. */
export function getPlacementFocusBounds(
    envelope: CustomizableEnvelope,
    wall: InstallationWallFace,
    productBounds: Bounds3
): Bounds3 {
    const points = [
        productBounds.min,
        productBounds.max,
        ...Object.values(getPlacementDimensionPoints(envelope, wall))
    ];
    return {
        min: {
            x: Math.min(...points.map((point) => point.x)),
            y: Math.min(...points.map((point) => point.y)),
            z: Math.min(...points.map((point) => point.z))
        },
        max: {
            x: Math.max(...points.map((point) => point.x)),
            y: Math.max(...points.map((point) => point.y)),
            z: Math.max(...points.map((point) => point.z))
        }
    };
}

/** The sidebar and 3D labels share parameter names and order. */
export const productParameterLabels = [
    ['widthMm', 'Width'], ['depthMm', 'Depth'],
    ['postInterval', 'Post spacing'], ['rafterInterval', 'Rafter spacing'],
    ['undersideHeightMm', 'Underside height'], ['wallHeightMm', 'Wall height']
] as const;

/** Product dimensions in its installation basis, independent of world-facing direction. */
export function getProductParameterDimensions(
    envelope: CustomizableEnvelope, wall: InstallationWallFace, params: Readonly<VarendaParams>
) {
    const origin = calculateEnvelopeCorners(envelope, wall).wallStart;
    const point = (along: number, outward: number, height: number): PlacementPointMm => ({
        x: origin.x + wall.alongWallUnit.x * along + wall.outwardUnit.x * outward,
        y: origin.y + height,
        z: origin.z + wall.alongWallUnit.z * along + wall.outwardUnit.z * outward
    });
    const { widthMm: width, depthMm: depth, wallHeightMm: wallHeight, undersideHeightMm: underside } = params;
    const starts: Record<keyof VarendaParams, PlacementPointMm> = {
        widthMm: point(0, depth + 250, 80),
        depthMm: point(width + 250, 0, 80),
        postInterval: point((width - params.postInterval) / 2, depth + 120, underside + 200),
        rafterInterval: point((width - params.rafterInterval) / 2, 0, wallHeight + 200),
        undersideHeightMm: point(width + 250, depth, 0),
        wallHeightMm: point(-250, 0, 0)
    };
    return productParameterLabels.map(([key, label]) => {
        const start = starts[key];
        const direction = key === 'depthMm' ? { ...wall.outwardUnit, y: 0 }
            : key === 'wallHeightMm' || key === 'undersideHeightMm' ? { x: 0, y: 1, z: 0 }
            : { ...wall.alongWallUnit, y: 0 };
        const valueMm = params[key];
        return { key, label, start, end: {
            x: start.x + direction.x * valueMm,
            y: start.y + direction.y * valueMm,
            z: start.z + direction.z * valueMm
        }, valueMm };
    });
}
