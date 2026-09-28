# PBR material import workflow — v1

This exploratory implementation standardizes the path from a licensed surface scan to a self-hosted PlayCanvas material. The active material is **Short Green Grass** (ambientCG Grass001), applied only outside the editable property. The initial Leafy Grass scan remains available as an import reference. House and yard materials remain unchanged.

## What is standardized

A material is a package with a stable ID, source provenance, physical repeat dimensions, two explicit quality profiles, and three registered texture maps. Provider filenames never determine runtime behavior. The package manifest determines it.

| Map | Runtime color space | Convention | PlayCanvas binding |
| --- | --- | --- | --- |
| Base color | sRGB | Color without baked directional lighting | `diffuseMap`, white diffuse multiplier |
| Normal | Linear/data | Tangent-space OpenGL (+Y) | `normalMap` |
| ORM | Linear/data | R = ambient occlusion, G = roughness, B = metallic | `aoMap.r`, `glossMap.g` with `glossInvert = true`, `metalnessMap.b` |

All maps must have identical dimensions and registration. OpenGL normal direction and image orientation are separate concepts: do not fix a DirectX normal map by flipping the whole image. Convert its green channel during source preparation, or obtain the provider's OpenGL map. V1 rejects a declared DirectX package.

Direct-map sources use packed ORM maps (Poly Haven calls the same layout ARM). Archive sources can explicitly specify base-color and OpenGL-normal entries plus separate AO and roughness entries and a constant metallic value. The importer packs these channels; it never guesses their meaning. See `materials/sources/short-grass.json`. Archive SHA-256 is verified, and named image entries are read without extracting arbitrary paths.

## Repository layout

```text
materials/sources/<id>.json       Pinned source URLs, SHA-256, provenance, scale
.material-cache/<id>/             Original downloads; ignored by Git, not deployed
public/materials/<id>/
  material.json                  Validated runtime manifest, sizes and checksums
  1k/{baseColor,normal,orm}.webp   Default web profile
  2k/{baseColor,normal,orm}.webp   Optional higher-resolution profile
scripts/import-material.py       Download, verify, resize and encode
scripts/check-materials.mjs      Offline manifest and file integrity check
src/materials/                  Generic manifest validation and PBR loading
src/rendering/                  Terrain application and scene-specific appearance
```

Only normalized web assets are served to the browser. The runtime does not call Poly Haven or download source images. Source records and web assets should be versioned together.

## First material and provenance

- Provider: [Poly Haven](https://polyhaven.com/a/leafy_grass)
- Asset: `leafy_grass`, author Charlotte Baglioni
- License: [CC0](https://polyhaven.com/license)
- Recorded source retrieval: 2026-09-28
- Physical scan footprint: **2 × 2 m** (provider metadata gives 2000 × 2000; asset page states 2 m width)
- Source: 2K PNG base color, OpenGL normal, and ARM; exact source hashes are pinned in `materials/sources/leafy-grass.json`
- Web assets are converted to RGB8; base color uses WebP quality 88, normal and ORM use lossless WebP after resize/conversion.

This is naturally mixed grass, exposed soil and fallen leaves, rather than a uniformly green manicured lawn. Material selection is an art-direction choice separate from the import standard.

## Import a material

Prerequisites: Node matching the project requirements, Python 3, and Pillow with WebP support. Existing runtime use needs no Python. Re-encoding output can vary with Pillow/libwebp versions, so the generated manifest records the actual output checksums.

1. Choose a seamless PBR surface with explicit permission to redistribute its textures. Record source page, author, license URL, retrieval date, and real-world width/depth.
2. Obtain matching base-color, OpenGL-normal and ORM source maps. Verify channels from the provider's documentation. Prefer PNG source data rather than introducing JPEG artifacts into normal/ORM maps.
3. Copy `materials/sources/leafy-grass.json` to a new source manifest. Change the ID, provenance, source URLs, SHA-256 hashes, and `tileMeters`. A new hash is a deliberate source update, not an automatic acceptance of a changed download.
4. Run:

```sh
npm run materials:import -- materials/sources/leafy-grass.json
npm run materials:check
```

5. Select the generated local manifest and quality in `src/rendering/config.ts`:

```ts
groundMaterial: {
    manifest: '/materials/short-grass/material.json',
    profile: '1k' as const
}
```

6. Review the material in the actual scene. Confirm its apparent physical scale, normal direction, reflectance, tiling and boundary behavior; an integrity check cannot decide whether a material looks correct.

The source-import process downloads only when a cached source is missing or fails its pinned checksum. It does not scrape asset catalogs or require a live asset API in the product. Runtime failures/timeouts keep neutral surroundings and do not prevent site editing.

## Scale, geometry and repetitions

The terrain ring contains four rectangles around a rectangular hole matching the property. The ring uses **world X/Z coordinates as UVs**. The material applies `1 / tileMeters` to every PBR map, so a 2 m scan remains 2 m regardless of camera, plane size or yard dimensions. It does not cover the editable property; the original neutral ground stays underneath as fallback.

One shared mesh and material serve the ring. The eight triangles and existing buffers are updated on property changes; textures are not reloaded. A single material package is owned for the renderer lifetime and disposed with it. There is no global multi-material catalog/refcount cache yet.

Large surfaces reveal repeated scan features even at correct scale. `terrain-sampling.ts` blends four translated samples with the same offsets for color, normal and ORM. No rotation is applied, so tangent-space normal orientation remains consistent. Explicit UV derivatives preserve mip selection at cell boundaries. The initial broad noise overlay was removed after visual review. Color and normal detail now fade according to projected UV footprint; distant color approaches a muted green, avoiding subpixel grass bands. This is an explicit terrain art-direction treatment, not an edit to the source texture.

This reduces repetition but can soften fine details. It also increases texture sampling cost. The terrain-specific shader extension targets PlayCanvas 2.22; its expected chunk signatures are checked when installed. Review it when upgrading the engine. Browser validation in this iteration used the active WebGL renderer. WebGPU transpilation is supported by the engine for GLSL-only chunks but was not independently validated here.

## Quality and budgets

| Profile | Download for three maps | Estimated RGBA8 GPU textures, with mipmaps |
| --- | ---: | ---: |
| 1K, default short grass | 4.53 MiB | 16 MiB |
| 2K, optional short grass | 17.00 MiB | 64 MiB |

These GPU estimates exclude decoded image memory, sky maps, shadows, frame buffers and other scene resources. WebP reduces transfer size; it is not GPU block compression. The browser only requests the configured profile, though both profiles are included in the static deployment.

V1 uses trilinear mip filtering and anisotropy up to 4. Start with 1K for the current distant views. Increasing resolution does not make distant blades of grass visible if they occupy less than a pixel. KTX2/Basis with configured transcoding is a potential next optimization; it is not part of this import path yet.

## Validation checklist

- `npm run materials:check`: required metadata, color spaces, profiles, byte counts and SHA-256 integrity.
- `npm test`: invalid manifests, ORM binding, physical scale, exterior-only coverage, upward triangles, stable UVs, failed/canceled load cleanup, plus existing scene regressions.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- Browser: all four views, transitions, zero/maximum/asymmetric dimensions, no texture movement on resize, labels readable, materials loaded from local paths, no new console errors.
- Failure handling: missing/failed maps must release partial resources and retain neutral terrain. Download failure cleanup is covered by the injected-failure test.

## Limits and next research steps

The current grass is a procedural PBR material from ambientCG, displayed on flat terrain; it is not photorealistic grass geometry. It cannot create grass silhouettes, terrain displacement, or parallax at the property edge. Height maps were intentionally omitted from the first package.

Next investigations, in order:

1. Compare a lawn scan and a grass/soil scan using the same physical scale and daylight to select the desired setting.
2. Measure GPU frame time on target desktop/mobile hardware before raising resolution or adding more sampling.
3. Evaluate KTX2 compression, preserving normal/ORM data quality.
4. Add a source adapter for separate AO/roughness/metallic maps when another supplier requires it.
5. Add sparse, distance-limited vegetation geometry if close viewing becomes a requirement.

## References

- [PlayCanvas physical materials](https://developer.playcanvas.com/user-manual/graphics/physical-rendering/physical-materials/)
- [PlayCanvas texture color spaces](https://developer.playcanvas.com/user-manual/graphics/linear-workflow/textures/)
- [StandardMaterial API](https://api.playcanvas.com/engine/classes/StandardMaterial.html)
- [Poly Haven asset license](https://polyhaven.com/license)
- [Poly Haven API terms](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md): live API usage has separate requirements from self-hosted CC0 assets.

## Visual revision: short green grass

The initial Leafy Grass scan was too brown and visibly repetitive at the fixed camera distances. The active material is now [ambientCG Grass001](https://ambientcg.com/a/Grass001), a CC0 procedural short lawn with a provider-stated footprint of approximately 1.4 × 1.4 m. The source archive, exact map entries and checksum are pinned in `materials/sources/short-grass.json`. Rebuild it with:

```sh
npm run materials:import -- materials/sources/short-grass.json
```

The environment uses lower normal/AO strength, no broad noise overlay, near-neutral sunlight, and a low-contrast distant color. Both packages are retained for comparison; only the active profile loads at runtime.
