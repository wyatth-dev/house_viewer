# House & Ground

A PlayCanvas Engine demo for defining a rectangular property around a Rhino house model. Adjust four yard clearances and switch between four fixed, elevated views.

## Run locally

Use Node.js **22.23.2 or later**. From this repository:

```sh
npm install
npm run dev
```

Open the local address printed by Vite. If an older Node is selected on this Mac, the existing Homebrew installation can be selected for the current terminal with:

```sh
export PATH="/opt/homebrew/opt/node/bin:$PATH"
node -v
```

## Controls

- Front yard, Back yard, Left clearance, Right clearance: meters from the house's rectangular **outer wall envelope** to the property boundary. Range 0–50 m; step 0.1 m.
- Defaults: front 5 m, back 7 m, left 2 m, right 2 m.
- Front / Back: angled perspective cameras (20° side angle, 40° elevation, 45° vertical field of view). Left / Right: retain the original orthographic cameras. No orbit or mouse navigation.
- Panel order: Property size → Typology → Perspective → Yard dimensions. Typology currently offers the selected Fairy house base model.
- View changes animate over 0.8 seconds, including the perspective/orthographic lens transition. Labels follow the camera; repeated clicks continue from the current pose. Reduced-motion preferences disable animation. Resizing or editing dimensions fits the selected view immediately.
- Invalid or empty field drafts show an error and retain the last valid site. Zero hides the corresponding ground region.
- Left and right are defined from outside, facing the front facade. Changing the camera never changes these meanings.

The front yard uses the paving material across the full property width, including both front corners. The back yard spans the full width behind the house; it shares a green material with both side strips. No yard plane covers the rectangular house envelope. Recesses within an irregular house outline are not landscaped in this first rectangular-site demo.

## Model and calibration

The model is `public/models/house.glb`. Original mesh hierarchy and materials are preserved.

Calibration lives in `src/house/house-config.ts`:

- Confirmed exterior width: **43 m** (user reference, 2026-09-28).
- Raw GLB width: 43,000; applied scale: **0.001**.
- Exterior wall envelope: X = -43000…0, Z = -57000…0. This includes the rear extension, beyond the wall named Back at Z=-48000.
- Ground reference: Y=0; the slab underside is not used as ground level.
- Named Front faces +Z; Left is -X and right is +X. Y is up.
- The resulting footprint is 43 × 57 m. Its X/Z center is placed at the origin. Yard edits never scale the house.

When replacing the model, verify these values again. Do not assume export units or use roof overhangs as wall boundaries. Name objects in Rhino's Object Properties, export the house separately from external landscaping, enable “Map Rhino Z to glTF Y,” and leave Draco compression disabled for this demo. Current runtime loading does not configure a Draco decoder.

The yaw setting is zero for this supplied asset; supporting a differently oriented asset also requires recalibrating the footprint and origin in that orientation.

## Module boundaries

```text
src/
  app/              # Composition, app-specific camera presets, resource lifecycle
  camera/           # Generic camera ownership, fitting, projection, view controls
  geometry/         # Neutral transport types
  house/            # GLB loading and verified model calibration
  model-preview/    # One-shot axonometric rendering and cached thumbnail lifecycle
  rendering/        # Procedural daylight environment, surroundings, and sunlight shadows
  site-definition/  # Dimensions, layout, ground, measurements, dimension controls
  ui/               # Shared panel shell
  main.ts           # Engine bootstrap and wiring
```

`camera/` and `site-definition/` never import each other. Camera fitting receives generic bounds; site labels receive a projection callback. `app/scene-controller.ts` coordinates these public interfaces. Typology thumbnails render the loaded model geometry and materials once at 320 × 240, through an isolated layer and orthographic camera. The temporary GPU resources are released after PNG encoding; the image URL is cached for the model lifetime and revoked on disposal. No extra GLB download or continuous thumbnail render loop is used. Camera and yard edits keep the same image.

View changes do not rebuild the site. Separate control sections share one panel.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests use Node's native test runner and TypeScript stripping, with no extra test dependency. Pure geometry and framing cases cover zero/maximum/asymmetric clearances and portrait/wide/deep views. Headless PlayCanvas tests check camera selection, snapshots, surface reuse, and cleanup. Loading lifecycle tests cover cancellation and failure. Browser checks cover live inputs, labels, mobile layout, and repeated edits.

`npm run build` writes the static app to `dist/`; `npm run start` previews that build. The development server is local only; no deployment is included.

## Scope and limitations

This stage defines the site only. It does not save edits, modify the house mesh, support sloped terrain or irregular boundaries, place furniture, or provide orbit controls. Measurement lines are drawn over geometry so they stay legible; they are explanatory overlays, not visibility/occlusion measurements. Ground colors are configured in `src/site-definition/ground.ts`. Remote Google Fonts enhance typography; system sans-serif fonts remain usable offline.

See [the implementation plan](docs/plans/2026-09-28-house-scene-configuration.md) and [execution notes](docs/plans/2026-09-28-house-scene-configuration-progress.md).

## Daylight environment

`src/rendering/config.ts` controls the sunny preset. A locally generated sky panorama supplies the background and filtered environment lighting; no downloaded HDR asset is included. One warm directional light casts filtered shadows. A muted textured plane extends beneath and around the editable site. Existing house and yard materials are retained, but their displayed brightness changes under the new lighting and ACES tone mapping.

The app passes generic scene bounds to the rendering module to update surroundings and shadow coverage. Camera far clipping is extended to keep the background visible during view transitions, without enlarging the bounds used to frame the house. Sky/lighting textures are generated once and released on disposal; shadows render in real time. This first preset does not include photographic scenery, detailed grass geometry, or animated weather.

## Exterior PBR materials

The surroundings now use a locally hosted short green grass material (ambientCG Grass001) outside the editable property. A validated manifest drives the independent `src/materials/` loader; the terrain renderer owns the mesh and repetition treatment. The default 1K profile downloads approximately 4.53 MiB and uses approximately 16 MiB of texture memory including mipmaps. A 2K profile is available through `src/rendering/config.ts`.

See [the material import workflow](docs/materials/import-workflow.md) for texture conventions, physical scale, source licenses, source imports, validation and known limits. Run `npm run materials:check` to verify all packaged texture hashes and metadata.

## Landscape context prototype

`src/landscape/` adds four lightweight procedural trees and a 6 m road parallel to the front facade, outside the front-yard boundary. They follow property edits. Trees share two meshes and two materials, with approximately 23k triangles total; only two trees cast shadows. No additional model download is required. Camera framing includes bounded context around the property. The road and tree appearance are prototypes; target-device frame time has not yet been benchmarked.
