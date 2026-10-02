import { Color, StandardMaterial } from 'playcanvas';
import type { Texture } from 'playcanvas';

import { metersToMm } from '../../shared/geometry/units.ts';

import type { MapRole, MaterialManifest } from './manifest.ts';

/** Mesh UV coordinates are measured in world millimeters, independent of its bounds. */
export function createPbrMaterial(manifest: MaterialManifest, maps: Record<MapRole, Texture>) {
    const material = new StandardMaterial();
    material.name = manifest.label;
    material.diffuse = new Color(1, 1, 1);
    material.diffuseMap = maps.baseColor;
    material.normalMap = maps.normal;
    material.bumpiness = 0.4;
    material.useMetalness = true;
    material.metalness = 1;
    material.metalnessMap = maps.orm;
    material.metalnessMapChannel = 'b';
    material.gloss = 1;
    material.glossInvert = true;
    material.glossMap = maps.orm;
    material.glossMapChannel = 'g';
    material.aoMap = maps.orm;
    material.aoMapChannel = 'r';
    material.aoMapUv = 0;
    for (const tiling of [
        material.diffuseMapTiling,
        material.normalMapTiling,
        material.glossMapTiling,
        material.aoMapTiling,
        material.metalnessMapTiling
    ]) {
        tiling.set(1 / metersToMm(manifest.tileMeters[0]), 1 / metersToMm(manifest.tileMeters[1]));
    }
    material.update();
    return material;
}
