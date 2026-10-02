import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseMaterialManifest } from '../src/site-definition/materials/manifest.ts';
import { createPbrMaterial } from '../src/site-definition/materials/material.ts';
import { surroundingGeometry } from '../src/site-definition/rendering/ground-geometry.ts';

const sample = JSON.parse(
    readFileSync(new URL('../public/site-definition/materials/leafy-grass/material.json', import.meta.url), 'utf8')
);
test('material validation rejects wrong color space, scale, channel convention and escaped URLs', () => {
    assert.deepEqual(parseMaterialManifest(sample).tileMeters, [2, 2]);
    for (const change of [
        (v) => {
            v.tileMeters[0] = 0;
        },
        (v) => {
            v.normalConvention = 'DirectX';
        },
        (v) => {
            v.profiles['1k'].maps.normal.colorSpace = 'srgb';
        },
        (v) => {
            v.profiles['1k'].maps.baseColor.file = '../../model.glb';
        },
        (v) => {
            v.profiles['1k'].maps.orm.width = 512;
        },
        (v) => {
            delete v.source.license;
        },
        (v) => {
            v.profiles['1k'].downloadBytes = 1;
        }
    ]) {
        const invalid = structuredClone(sample);
        change(invalid);
        assert.throws(() => parseMaterialManifest(invalid));
    }
});
test('PBR material maps ORM channels correctly and preserves physical scale with millimeter UVs across maps', () => {
    const maps = { baseColor: {}, normal: {}, orm: {} };
    const material = createPbrMaterial(parseMaterialManifest(sample), maps);
    try {
        assert.equal(material.diffuseMap, maps.baseColor);
        assert.equal(material.normalMap, maps.normal);
        assert.equal(material.glossMap, maps.orm);
        assert.equal(material.glossInvert, true);
        assert.equal(material.glossMapChannel, 'g');
        assert.equal(material.aoMapChannel, 'r');
        assert.equal(material.metalnessMapChannel, 'b');
        for (const tiling of [
            material.diffuseMapTiling,
            material.normalMapTiling,
            material.glossMapTiling,
            material.aoMapTiling,
            material.metalnessMapTiling
        ])
            assert.deepEqual([tiling.x, tiling.y], [0.0005, 0.0005]);
    } finally {
        material.destroy();
    }
});
test('surroundings cover only the exterior, face upward and keep UVs anchored when property dimensions change', () => {
    for (const bounds of [
        { min: { x: -21.5, y: 0, z: -28.5 }, max: { x: 21.5, y: 1, z: 28.5 } },
        { min: { x: -71.5, y: 0, z: -78.5 }, max: { x: 71.5, y: 1, z: 78.5 } },
        { min: { x: -23.5, y: 0, z: -60 }, max: { x: 48, y: 1, z: 33.5 } }
    ]) {
        const data = surroundingGeometry(bounds, 1200, -0.06);
        let area = 0;
        for (let i = 0; i < data.indices.length; i += 3) {
            const vertices = data.indices
                .slice(i, i + 3)
                .map((index) => data.positions.slice(index * 3, index * 3 + 3));
            const [a, b, c] = vertices;
            const upward = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
            assert.ok(upward > 0);
            area += upward / 2;
            const x = (a[0] + b[0] + c[0]) / 3,
                z = (a[2] + b[2] + c[2]) / 3;
            assert.ok(x <= bounds.min.x || x >= bounds.max.x || z <= bounds.min.z || z >= bounds.max.z);
        }
        assert.equal(area, 2400 ** 2 - (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z));
        for (let i = 0; i < data.positions.length / 3; i++)
            assert.deepEqual(data.uvs.slice(i * 2, i * 2 + 2), [data.positions[i * 3], data.positions[i * 3 + 2]]);
    }
});
