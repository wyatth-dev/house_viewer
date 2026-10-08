import fairyHouse from '../../../public/scenes/typology/fairy-house/scene.json' with { type: 'json' };
import sunningdaleHouse from '../../../public/scenes/typology/sunningdale-house/scene.json' with { type: 'json' };
import catalog from '../../../public/scenes/typology/index.json' with { type: 'json' };
import type { InstallationWallFace } from '../../product-placement/types.ts';

type Vector2 = { x: number; z: number };
type Vector3 = { x: number; y: number; z: number };

/** Fields of a typology scene.json that the viewer relies on (built-in or photo-generated). */
export type TypologyManifest = {
    schemaVersion: number;
    id: string;
    name: string;
    model: string;
    units: string;
    axes: { up: string; front: string };
    preview?: { mode: string };
    calibration: {
        actualWidthMm: number;
        sourceFootprint: { minX: number; maxX: number; minZ: number; maxZ: number };
        groundY: number;
        yawDegrees: number;
    };
    installationFaces: {
        wallFaceId: string;
        side: string;
        originMm: Vector3;
        lengthMm: number;
        alongWallUnit: Vector2;
        outwardUnit: Vector2;
    }[];
    representations: Record<string, { model: string }>;
};
export type Typology = ReturnType<typeof parseTypology>;
export type TypologySource = 'builtin' | 'photo';

/**
 * Validate and calibrate one manifest. `baseUrl` is the folder that holds scene.json
 * (e.g. `/scenes/typology/fairy-house/` or `/data/typologies/house-002/`).
 */
export function parseTypology(scene: TypologyManifest, baseUrl: string, origin: TypologySource) {
    const id = scene?.id;
    if (
        !scene ||
        scene.schemaVersion !== 1 ||
        scene.units !== 'mm' ||
        scene.axes.up !== '+Y' ||
        scene.axes.front !== '+Z'
    ) {
        throw new Error(`Unsupported typology: ${id}`);
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
        throw new Error(`Invalid calibration for typology: ${id}`);
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
    return { ...scene, source: origin, baseUrl, modelUrl: `${baseUrl}${scene.model}`, installationFaces };
}

/** Built-in manifests are bundled; register new built-in manifests here. */
const manifests: TypologyManifest[] = [fairyHouse, sunningdaleHouse];
export const typologies = catalog.typologies.map((entry) => {
    const scene = manifests.find(({ id }) => id === entry.id);
    if (!scene) throw new Error(`Unsupported typology: ${entry.id}`);
    const directory = entry.manifest.slice(0, entry.manifest.lastIndexOf('/') + 1);
    return parseTypology(scene, `/scenes/typology/${directory}`, 'builtin');
});
export const defaultTypology = typologies.find(({ id }) => id === catalog.defaultTypologyId)!;
if (!defaultTypology) throw new Error('The default typology is not registered.');

/**
 * The typology this page shows. main.ts sets it before it imports the app, so
 * modules that read it at load time (house-config, installation-faces) see the chosen one.
 */
let active: Typology = defaultTypology;
export const activeTypology = (): Typology => active;
export function setActiveTypology(typology: Typology) {
    active = typology;
}
