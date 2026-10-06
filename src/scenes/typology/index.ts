import fairyHouse from '../../../public/scenes/typology/fairy-house/scene.json' with { type: 'json' };
import catalog from '../../../public/scenes/typology/index.json' with { type: 'json' };
import type { InstallationWallFace } from '../../product-placement/types.ts';

/** Public manifests are the source of truth; register new manifests here for bundling. */
const manifests = [fairyHouse];
export const typologies = catalog.typologies.map((entry) => {
    const scene = manifests.find(({ id }) => id === entry.id);
    if (
        !scene ||
        scene.schemaVersion !== 1 ||
        scene.units !== 'mm' ||
        scene.axes.up !== '+Y' ||
        scene.axes.front !== '+Z'
    ) {
        throw new Error(`Unsupported typology: ${entry.id}`);
    }
    const { actualWidthMm, sourceFootprint: source, groundY, yawDegrees } = scene.calibration;
    if (
        ![actualWidthMm, source.minX, source.maxX, source.minZ, source.maxZ, groundY, yawDegrees].every(
            Number.isFinite
        ) ||
        actualWidthMm <= 0 ||
        Math.abs(actualWidthMm - (source.maxX - source.minX)) > 0.01 ||
        source.maxX <= source.minX ||
        source.maxZ <= source.minZ ||
        yawDegrees !== 0
    ) {
        throw new Error(`Invalid calibration for typology: ${entry.id}`);
    }
    const scale = 1; // Model coordinates are millimeters; never repair units by scaling.
    const ids = new Set<string>();
    const installationFaces: InstallationWallFace[] = scene.installationFaces.map((face) => {
        const side = face.side;
        if (side !== 'front' && side !== 'back' && side !== 'left' && side !== 'right') {
            throw new Error(`Invalid wall side: ${side}`);
        }
        const { originMm, alongWallUnit: along, outwardUnit: outward, lengthMm } = face;
        if (
            ids.has(face.wallFaceId) ||
            !face.wallFaceId ||
            lengthMm <= 0 ||
            ![originMm.x, originMm.y, originMm.z, lengthMm, along.x, along.z, outward.x, outward.z].every(
                Number.isFinite
            ) ||
            Math.abs(Math.hypot(along.x, along.z) - 1) > 1e-6 ||
            Math.abs(Math.hypot(outward.x, outward.z) - 1) > 1e-6 ||
            Math.abs(along.x * outward.x + along.z * outward.z) > 1e-6
        ) {
            throw new Error(`Invalid installation wall: ${face.wallFaceId}`);
        }
        ids.add(face.wallFaceId);
        return {
            ...face,
            side,
            structureId: 'house-1',
            originMm: {
                x: (originMm.x - (source.minX + source.maxX) / 2) * scale,
                y: (originMm.y - groundY) * scale,
                z: (originMm.z - (source.minZ + source.maxZ) / 2) * scale
            },
            lengthMm: lengthMm * scale
        };
    });
    const directory = entry.manifest.slice(0, entry.manifest.lastIndexOf('/') + 1);
    return { ...scene, modelUrl: `/scenes/typology/${directory}${scene.model}`, installationFaces };
});
export const defaultTypology = typologies.find(({ id }) => id === catalog.defaultTypologyId)!;
if (!defaultTypology) throw new Error('The default typology is not registered.');
