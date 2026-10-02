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

The model is `public/models/house-edit.glb`. Original mesh hierarchy and materials are preserved.

Calibration lives in `src/scene/house/house-config.ts`:

- Confirmed exterior width: **43 m** (user reference, 2026-09-28).
- Raw GLB width: 43,000 mm; applied scale: **1**. Scene coordinates and internal lengths use millimetres.
- Exterior wall envelope: X = -43000…0, Z = -57000…0. This includes the rear extension, beyond the wall named Back at Z=-48000.
- Ground reference: Y=0; the slab underside is not used as ground level.
- Named Front faces +Z; Left is -X and right is +X. Y is up.
- The resulting footprint is 43 × 57 m. Its X/Z center is placed at the origin. Yard edits never scale the house.

When replacing the model, verify these values again. Do not assume export units or use roof overhangs as wall boundaries. Name objects in Rhino's Object Properties, export the house separately from external landscaping, enable “Map Rhino Z to glTF Y,” and leave Draco compression disabled for this demo. Current runtime loading does not configure a Draco decoder.

The yaw setting is zero for this supplied asset; supporting a differently oriented asset also requires recalibrating the footprint and origin in that orientation.

## Module boundaries

```text
src/
  main.ts                     # Independent main entry; starts Site Definition
  site-definition/            # Site startup, panel, dimensions and scene coordination
    materials/                # Site PBR loading and source/license records
    rendering/                # Site terrain, lighting and environment
  customization/              # Independent product startup, parameter inputs, camera, diagnostics
  products/
    parametric-engine/varenda/ # Parameters, catalog, datums and engineering relationships
    varenda/view/             # Product model manifest and PlayCanvas rendering adapter
  scene/
    house/                    # House loading and verified calibration
    landscape/                # Road and tree context
    model-preview/            # One-shot model thumbnail
  shared/
    assets/                   # Generic GLB loading and scene-owned resource store
    camera/                   # Camera fitting, transitions, projection and view controls
    geometry/                 # Scene types and unit conversion
    lifetime.ts               # Abort and resource disposal
```

Site Definition and Customization are peer features. `/` loads `src/main.ts`, which calls `startSiteDefinition()`. The independent `/src/customization/index.html` page loads `src/customization/main.ts`, which calls `startCustomization()`; it is not connected to the main page yet. The previous `/varenda-lab.html` address remains an alias in the Vite development and preview servers. Unknown page URLs return 404 instead of displaying Site Definition.

`products/` owns product definitions and rendering metadata. Its `parametric-engine/` contains product-specific engineering modules and can later support other products alongside Varenda. Engineering has no DOM, PlayCanvas or GLB dependency. The view consumes engineering results and maps their coordinates into the scene. `products/varenda/view/assets.ts` lists model URLs and source sample lengths; downloadable GLBs remain at stable URLs in `public/models/varenda/`.

Customization's `parameter-inputs.ts` collects input drafts and releases event listeners; startup validates and commits successful solves. `product-camera.ts` owns Overview framing, and `diagnostics.ts` contains the existing engineering inspection output. Site Definition's `dimension-inputs.ts` owns its dimension inputs. Site rendering surfaces in `site-definition/materials/` are distinct from a future production material list.



`shared/camera/` does not depend on Site Definition; Site Definition composes the shared camera through its startup, presets and scene coordinator. Camera fitting receives generic bounds; site labels receive a projection callback. `site-definition/scene-controller.ts` coordinates these public interfaces. Typology thumbnails render the loaded model geometry and materials once at 320 × 240, through an isolated layer and orthographic camera. The temporary GPU resources are released after PNG encoding; the image URL is cached for the model lifetime and revoked on disposal. No extra GLB download or continuous thumbnail render loop is used. Camera and yard edits keep the same image.

View changes do not rebuild the site. Separate control sections share one panel.

## Repository root

- `src/`, `public/`, `tests/`: application code, served assets and tests.
- `scripts/site-definition/`: site material integrity checker. Site texture source and license records live in `src/site-definition/materials/sources/`; served textures live in `public/site-definition/materials/`. Product models and their materials remain with the corresponding product assets.
- `docs/`: designs, plans, material import instructions and development history (`history/`).
- `index.html`: main page entry. The independent product page is `src/customization/index.html`.
- `package.json`, `package-lock.json`, TypeScript/ESLint/Prettier/npm configuration: dependencies and build configuration.

`node_modules/` is installed dependency data; `dist/` is generated by the production build. Neither is source. Verify packaged site textures with `npm run materials:check`. Completed Python asset-generation/import scripts and download caches have been removed.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests use Node's native test runner and TypeScript stripping, with no extra test dependency. Pure geometry and framing cases cover zero/maximum/asymmetric clearances and portrait/wide/deep views. Headless PlayCanvas tests check camera selection, snapshots, surface reuse, and cleanup. Loading lifecycle tests cover cancellation and failure. Browser checks cover live inputs, labels, mobile layout, and repeated edits.

`npm run build` builds both independent pages to `dist/`; `npm run start` previews that build. The development server is local only; no deployment is included.

## Scope and limitations

The main page currently defines the site. The independent Customization page previews and parameterizes Varenda. It does not save edits, modify the house mesh, support sloped terrain or irregular boundaries, place furniture, or provide orbit controls. Measurement lines are drawn over geometry so they stay legible; they are explanatory overlays, not visibility/occlusion measurements. Ground colors are configured in `src/site-definition/ground.ts`. Remote Google Fonts enhance typography; system sans-serif fonts remain usable offline.

See [the implementation plan](docs/plans/2026-09-28-house-scene-configuration.md) and [execution notes](docs/plans/2026-09-28-house-scene-configuration-progress.md).

## Daylight environment

`src/site-definition/rendering/config.ts` controls the sunny preset. A locally generated sky panorama supplies the background and filtered environment lighting; no downloaded HDR asset is included. One warm directional light casts filtered shadows. A muted textured plane extends beneath and around the editable site. Existing house and yard materials are retained, but their displayed brightness changes under the new lighting and ACES tone mapping.

The app passes generic scene bounds to the rendering module to update surroundings and shadow coverage. Camera far clipping is extended to keep the background visible during view transitions, without enlarging the bounds used to frame the house. Sky/lighting textures are generated once and released on disposal; shadows render in real time. This first preset does not include photographic scenery, detailed grass geometry, or animated weather.

## Exterior PBR materials

The surroundings now use a locally hosted short green grass material (ambientCG Grass001) outside the editable property. A validated manifest drives the independent `src/site-definition/materials/` loader; the terrain renderer owns the mesh and repetition treatment. The default 1K profile downloads approximately 4.53 MiB and uses approximately 16 MiB of texture memory including mipmaps. A 2K profile is available through `src/site-definition/rendering/config.ts`.

See [the material import workflow](docs/materials/import-workflow.md) for texture conventions, physical scale, source licenses, source imports, validation and known limits. Run `npm run materials:check` to verify all packaged texture hashes and metadata.

## Landscape context prototype

`src/scene/landscape/` adds four lightweight procedural trees and a 6 m road parallel to the front facade, outside the front-yard boundary. They follow property edits. Trees share two meshes and two materials, with approximately 23k triangles total; only two trees cast shadows. No additional model download is required. Camera framing includes bounded context around the property. The road and tree appearance are prototypes; target-device frame time has not yet been benchmarked.

## Customization and production preview

Customization uses a left 3D preview and right parameter panel, matching Site Definition. Its Production List tab switches to a sticky preview above an expandable list. Installed components are grouped by material and specification, with placeholder thumbnails and explicit pending metadata. Selecting a row frames and highlights its instances, fades other components, and animates the camera for 0.8 seconds. Overview resets selection. Fasteners appear as lines through their installed bore axes; no screw model is required. Invalid parameter drafts retain the last valid product and list. This independent entry is not integrated into the main workflow.

Expanded production rows support individual instance focus (including each Post column). Related-part navigation follows shared column IDs, fixing-plate fastener references, end-cap connections and glazing installations. Each related component can be focused separately and navigated back to the originating instance or the full group. Post fastening schedules remain undefined, so post connections currently expose the matching footing only.
