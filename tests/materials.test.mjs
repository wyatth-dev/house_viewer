import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseMaterialManifest } from '../src/site-definition/materials/manifest.ts';
import { createPbrMaterial } from '../src/site-definition/materials/material.ts';

const sample = JSON.parse(
    readFileSync(new URL('../public/site-definition/materials/short-grass/material.json', import.meta.url), 'utf8')
);
test('material validation rejects wrong color space, scale, channel convention and escaped URLs', () => {
    assert.deepEqual(parseMaterialManifest(sample).tileMeters, [1.4, 1.4]);
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
            assert.deepEqual([tiling.x, tiling.y], [1 / 1400, 1 / 1400]);
    } finally {
        material.destroy();
    }
});
