# Site surface materials

Site Definition owns the current grass textures, source records and runtime surface loading. Product surfaces belong to the corresponding product assets; the existing Varenda GLBs preserve their embedded materials.

## Locations

- `src/site-definition/materials/`: manifest validation, PBR material creation and loading.
- `src/site-definition/materials/sources/`: pinned original sources, SHA-256 values, licenses and physical texture scale.
- `public/site-definition/materials/`: generated 1K/2K textures and runtime manifests.
- `src/site-definition/rendering/`: site terrain, daylight and environment application.
- `scripts/site-definition/check-materials.mjs`: offline manifest and texture integrity checker.

The active site material is short grass from ambientCG Grass001, with a 1.4 × 1.4 m repeat. Detailed source and license records are preserved in the source JSON files and runtime manifests.

## Runtime conventions

Base color uses sRGB; OpenGL normals and packed ORM use linear data. ORM channels are R = occlusion, G = roughness, B = metallic. The manifest defines texture size, color space, checksums and physical repeat dimensions. Ground geometry and scene distances use millimeters.

The browser loads only local normalized textures. The completed Python material importer, glazing exporter and source-download caches have been removed. No import command is provided by the project now; source records remain available for future asset preparation.

## Validation

Run `npm run materials:check` to validate packaged profiles, metadata, file sizes and SHA-256 values. Run existing tests, typecheck, lint and builds after changing runtime material code. Visual checks should confirm scale, tiling, lighting and fallback behavior.
