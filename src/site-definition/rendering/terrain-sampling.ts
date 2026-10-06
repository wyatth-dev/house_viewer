import { ShaderChunks, SHADERLANGUAGE_GLSL } from 'playcanvas';
import type { GraphicsDevice, StandardMaterial } from 'playcanvas';

/** Translation-only blending preserves normal orientation and aligns every PBR channel. */
export function applyTerrainSampling(material: StandardMaterial, device: GraphicsDevice) {
    const chunks = material.getShaderChunks(SHADERLANGUAGE_GLSL);
    const defaults = ShaderChunks.get(device, SHADERLANGUAGE_GLSL);
    material.shaderChunksVersion = '2.22';
    chunks.set(
        'terrainSamplingPS',
        `
#ifndef TERRAIN_SAMPLING_INCLUDED
#define TERRAIN_SAMPLING_INCLUDED
uniform vec3 terrainAverageColor;
float terrainDetailWeight(vec2 uv) {
    float footprint = max(length(dFdx(uv)), length(dFdy(uv)));
    return 1.0 - smoothstep(0.04, 0.20, footprint);
}
vec2 terrainOffset(vec2 cell) {
    return fract(sin(vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3)))) * 43758.5453) * 37.0;
}
vec4 terrainSample(sampler2D map, vec2 uv, float bias) {
    vec2 cell = floor(uv * 0.5);
    vec2 weight = fract(uv * 0.5);
    weight = weight * weight * (3.0 - 2.0 * weight);
    // Derivatives of the unshifted UV avoid mip seams across randomized cells.
    vec2 dx = dFdx(uv) * exp2(bias);
    vec2 dy = dFdy(uv) * exp2(bias);
    vec4 a = textureGrad(map, uv + terrainOffset(cell), dx, dy);
    vec4 b = textureGrad(map, uv + terrainOffset(cell + vec2(1.0, 0.0)), dx, dy);
    vec4 c = textureGrad(map, uv + terrainOffset(cell + vec2(0.0, 1.0)), dx, dy);
    vec4 d = textureGrad(map, uv + terrainOffset(cell + vec2(1.0, 1.0)), dx, dy);
    return mix(mix(a, b, weight.x), mix(c, d, weight.x), weight.y);
}
#endif
`
    );
    for (const [chunk, slot] of [
        ['diffusePS', 'DIFFUSE'],
        ['normalMapPS', 'NORMAL'],
        ['glossPS', 'GLOSS'],
        ['aoPS', 'AO'],
        ['metalnessPS', 'METALNESS']
    ]) {
        const original = defaults.get(chunk);
        if (!original) throw new Error(`Missing terrain shader chunk: ${chunk}`);
        const token = `texture2DBias({STD_${slot}_TEXTURE_NAME}, {STD_${slot}_TEXTURE_UV}, textureBias)`;
        if (!original.includes(token)) throw new Error(`Terrain shader needs updating for this engine: ${chunk}`);
        let replacement = original.replace(
            token,
            `terrainSample({STD_${slot}_TEXTURE_NAME}, {STD_${slot}_TEXTURE_UV}, textureBias)`
        );
        if (slot === 'DIFFUSE')
            replacement = replacement.replace(
                'dAlbedo *= albedoTexture;',
                'dAlbedo *= mix(terrainAverageColor, albedoTexture, 0.12 * terrainDetailWeight({STD_DIFFUSE_TEXTURE_UV}));'
            );
        if (slot === 'NORMAL')
            replacement = replacement.replace(
                'normalMap, material_bumpiness)',
                'normalMap, material_bumpiness * terrainDetailWeight({STD_NORMAL_TEXTURE_UV}))'
            );
        chunks.set(chunk, '#include "terrainSamplingPS"\n' + replacement);
    }
    // A muted linear-space green for subpixel detail; it is an art-direction setting, not a source edit.
    material.setParameter('terrainAverageColor', [0.29, 0.34, 0.23]);
    material.update();
}
