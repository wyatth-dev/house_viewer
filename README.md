# House & Ground

A PlayCanvas application for defining a property around a Rhino house model, placing Varenda products, and inspecting their parameters and production parts. Adjust four yard clearances and switch between four fixed, elevated views.

## Run locally

Requirements (one-time): **Node.js 22.23.2 or later**, **[uv](https://docs.astral.sh/uv/)** (`brew install uv`), and for automatic photo modelling, **Claude Code** signed in on this Mac (the service runs `claude -p` in the background).

```sh
npm run dev      # front end (hot reload) + Python modelling service, one command
```

Open the address Vite prints (usually http://localhost:5173). `Ctrl+C` stops both processes. The first run installs npm packages if `node_modules` is missing and runs `uv sync` for the Python service (fast when already up to date), so there is no separate Python step.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + Python service (`/api`, `/files`, `/data` are proxied to it) |
| `npm start` | Build once, then the Python service serves everything at http://127.0.0.1:8765 |
| `npm run dev:web` | Front end only; built-in typologies work, photo typologies and intake need the service |
| `npm test` / `npm run test:service` | Front-end tests / Python service tests |

Environment variables: `FACADE_HTTP_PORT` (default 8765), `FACADE_DATA_DIR` (default `./data`), `FACADE_AUTORUN=0` (no automatic modelling), `FACADE_CLAUDE_BIN` (path to `claude` if it is not found automatically).

If an older Node is selected on this Mac, the existing Homebrew installation can be selected for the current terminal with:

```sh
export PATH="/opt/homebrew/opt/node/bin:$PATH"
node -v
```

## New typology from photo

The Typology section has two groups: **Preset** (round icons, bundled in `public/`) and **From photo**; each group scrolls sideways when it overflows. **New from photo** opens `/intake.html`. Upload photos of the front of a house (the facade width is optional). Modelling starts automatically; when it is submitted, the latest build is published as a typology and appears in the typology list. **Open in house viewer** loads it (`/?typology=<id>`). Choosing another typology swaps the house in place (same fade as representation changes): camera, lighting, landscape and yard dimensions stay; placed products are cleared because they belong to the previous house's walls. The URL follows (`?typology=`), and the browser back button returns to the previous house. Thumbnails: presets use static `preview.png` files; a photo typology's thumbnail is rendered from its facade side the first time it is opened and stored by the service.

Photo typologies use the same contract as the built-in ones (`scene.json` + white / color-block / render GLBs, millimetres, front = +Z) with one installation face, `facade-main`. The intake form asks which side the photos show; the default is **Back of the house**, so the modelled facade faces the back yard (installation face `side: back`) and the street side is a plain wall. Choose *Front* for a street-side photo. Modelling details, tools and limits: `services/facade-modeler/README.md`.

## Files and data

```text
src/                 Front-end code only (two pages: index.html → src/main.ts, intake.html → src/photo-intake/)
public/              Static assets bundled with the app, including the built-in typologies (seed data)
services/
  facade-modeler/    Python modelling service (uv project): HTTP API, MCP tools, GLB builder
data/                Local data store standing in for a database; not in git (see data/README.md)
  intake/<project>/  Photo intake workspaces: photos, spec, builds/vN, job logs
  typologies/        Published photo typologies + index.json (what the viewer reads)
scripts/dev.mjs      The one-command launcher behind npm run dev / npm start
```

The front end never writes files. It reads built-in typologies from `public/` and photo typologies through the service (`GET /api/typologies`, `/data/typologies/<id>/…`). Only the service writes to `data/`.

## Controls

- Front yard, Back yard, Left clearance, Right clearance: meters from the house's rectangular **outer wall envelope** to the property boundary. Range 0–50 m; step 0.1 m.
- Defaults: front 5 m, back 7 m, left 2 m, right 2 m.
- Front / Back: angled perspective cameras (20° side angle, 40° elevation, 45° vertical field of view). Left / Right: retain the original orthographic cameras. Drag with the left mouse button to orbit around the current focus; use the wheel to zoom. Right/middle buttons do not pan. Clicking a view button restores its preset, including the active view after manual navigation.
- Panel order: Property size → Typology → Perspective → Yard dimensions. Typology currently offers the selected Fairy house base model.
- View changes animate over 0.8 seconds, including the perspective/orthographic lens transition. Labels follow the camera; repeated clicks continue from the current pose. Reduced-motion preferences disable animation. Resizing or editing dimensions fits the selected view immediately.
- Invalid or empty field drafts show an error and retain the last valid site. Zero hides the corresponding ground region.
- Left and right are defined from outside, facing the front facade. Changing the camera never changes these meanings.

The front yard uses the paving material across the full property width, including both front corners. The back yard spans the full width behind the house; it shares a green material with both side strips. No yard plane covers the rectangular house envelope. Recesses within an irregular house outline are not landscaped in this first rectangular-site demo.

## Model and calibration

The model is `public/scenes/typology/fairy-house/model.glb`. Original mesh hierarchy and materials are preserved.

Calibration lives in `public/scenes/typology/fairy-house/scene.json`; `src/scene/house/house-config.ts` reads the default typology:

- Rhino source: `../CeluplastVS/resources/modelling/House_Fairy/House_Fairy_source.3dm`, authored in millimeters.
- Exterior wall envelope: X = -13716…0 mm, Z = -17576.8…0 mm; ground Y=0.
- Main eave is 2743.2 mm; main ridge is approximately 6903.72 mm (estimated from reference renderings).
- GLB vertex coordinates and scene dimensions use millimeters. Models load at scale 1; manifest width must match its source footprint. Unit mismatches are rejected rather than corrected by automatic scaling.
- Named Front faces +Z; Left is -X and right is +X. Y is up. The footprint center is placed at the origin.

For future imports, author the source in millimeters and verify the exported GLB coordinates: Rhino's glTF exporter converts millimeters to meters, so bake a ×1000 conversion into POSITION data before importing here. Normals stay unit length. Update position accessor bounds, wall envelope and installation face coordinates together. Enable “Map Rhino Z to glTF Y,” export open meshes and vertex normals, disable “Cull backfaces” for this thin shell, and disable Draco compression. Exclude reference images and construction curves. Verify every shell object has a nonempty exported mesh and inspect the four exterior views before replacing the asset.

The yaw setting is zero for this supplied asset; supporting a differently oriented asset also requires recalibrating the footprint and origin in that orientation.

## Module boundaries

```text
src/
  main.ts                     # Single application entry; starts the house-viewer workflow
  site-definition/            # Site startup, panel, dimensions and scene coordination
    materials/                # Site PBR loading and source/license records
    rendering/                # Site terrain, lighting and environment
  product-placement/          # Product placement, editing, production list and selection
  scenes/typology/             # Catalog and calibrated scene input data
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

`/` loads `src/main.ts`, which resolves the typology (`?typology=`, default Fairy house) and then imports and calls `startSiteDefinition()`. `/intake.html` loads the photo intake page, `src/photo-intake/`, which reuses `src/shared/`. The main workflow includes site setup, product placement, parameter editing and production-list navigation. Unknown page URLs return 404. The former independent customization page and lab route have been removed.

`products/` owns product definitions and rendering metadata. Its `parametric-engine/` contains product-specific engineering modules and can later support other products alongside Varenda. Engineering has no DOM, PlayCanvas or GLB dependency. The view consumes engineering results and maps their coordinates into the scene. `products/varenda/view/assets.ts` lists model URLs and source sample lengths; downloadable GLBs remain at stable URLs in `public/models/varenda/`.

`product-placement/` owns the product editing flow, production-list display groups and selection state. Site Definition's `dimension-inputs.ts` owns yard inputs. Site rendering surfaces in `site-definition/materials/` are distinct from the production material list.

`shared/camera/` does not depend on Site Definition; Site Definition composes the shared camera through its startup, presets and scene coordinator. Camera fitting receives generic bounds; site labels receive a projection callback. `site-definition/scene-controller.ts` coordinates these public interfaces. Typology thumbnails render the loaded model geometry and materials once at 320 × 240, through an isolated layer and orthographic camera. The temporary GPU resources are released after PNG encoding; the image URL is cached for the model lifetime and revoked on disposal. No extra GLB download or continuous thumbnail render loop is used. Camera and yard edits keep the same image.

View changes do not rebuild the site. Separate control sections share one panel.

## Repository root

- `src/`, `public/`, `tests/`: application code, served assets and tests.
- `scripts/site-definition/`: site material integrity checker. Site texture source and license records live in `src/site-definition/materials/sources/`; served textures live in `public/site-definition/materials/`. Product models and their materials remain with the corresponding product assets.
- `docs/`: designs, plans, material import instructions and development history (`history/`).
- `index.html`, `intake.html`: the house viewer and the photo intake page.
- `services/`, `data/`: see Files and data above.
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

`npm run build` builds the main application to `dist/`; `npm run start` previews that build. The development server is local only; no deployment is included.

## Scope and limitations

The main workflow defines the site and supports Varenda placement, parameter editing and production-part inspection. It does not persist edits across reloads, modify the house mesh, support sloped terrain or irregular boundaries, place furniture, or provide panning. Measurement lines are drawn over geometry so they stay legible; they are explanatory overlays, not visibility/occlusion measurements. Ground colors are configured in `src/site-definition/ground.ts`. Remote Google Fonts enhance typography; system sans-serif fonts remain usable offline.

See [the implementation plan](docs/plans/2026-09-28-house-scene-configuration.md) and [execution notes](docs/plans/2026-09-28-house-scene-configuration-progress.md).

## Daylight environment

`src/site-definition/rendering/config.ts` controls the sunny preset. A locally generated sky panorama supplies the background and filtered environment lighting; no downloaded HDR asset is included. One warm directional light casts filtered shadows. A muted textured plane extends beneath and around the editable site. Existing house and yard materials are retained, but their displayed brightness changes under the new lighting and ACES tone mapping.

The app passes generic scene bounds to the rendering module to update surroundings and shadow coverage. Camera far clipping is extended to keep the background visible during view transitions, without enlarging the bounds used to frame the house. Sky/lighting textures are generated once and released on disposal; shadows render in real time. This first preset does not include photographic scenery, detailed grass geometry, or animated weather.

## Exterior PBR materials

The surroundings now use a locally hosted short green grass material (ambientCG Grass001) outside the editable property. A validated manifest drives the independent `src/site-definition/materials/` loader; the terrain renderer owns the mesh and repetition treatment. The default 1K profile downloads approximately 4.53 MiB and uses approximately 16 MiB of texture memory including mipmaps. A 2K profile is available through `src/site-definition/rendering/config.ts`.

See [the material import workflow](docs/materials/import-workflow.md) for texture conventions, physical scale, source licenses, source imports, validation and known limits. Run `npm run materials:check` to verify all packaged texture hashes and metadata.

## Road context

`src/scene/landscape/` adds a 6 m road parallel to the front facade, outside the front-yard boundary. It follows property edits. Camera framing includes the property and nearby road strip. Procedural trees and their geometry have been removed. The road appearance remains a prototype.

## Customization and production preview

After site setup, select and place a Varenda on an available house wall. Select a placed product to edit parameters or inspect its Production List. Installed components are grouped by material and specification, with placeholder thumbnails and explicit pending metadata. Selecting a row frames and highlights its instances and fades other components. Invalid parameter drafts retain the last valid product and list.

Expanded production rows support individual instance focus (including each Post column). Related-part navigation follows shared column IDs, fixing-plate fastener references, end-cap connections and glazing installations. Each related component can be focused separately and navigated back to the originating instance or the full group. Post fastening schedules remain undefined, so post connections currently expose the matching footing only.

## Typology scene inputs

`public/scenes/typology/index.json` lists available house types and the default ID. Each type owns a folder containing `scene.json` and `model.glb`. Runtime metadata is imported through `src/scenes/typology/index.ts`; the panel, house calibration and installation walls use the same default definition.

Version 1 manifests declare `id`, `name`, a relative `model` path, millimetre units, +Y up and +Z front axes, preview mode, calibration and installation faces. Wall origins and lengths use the original model coordinates, before centering and scaling; the loader applies the same calibration as the house. Wall IDs must be unique; along-wall and outward directions must be perpendicular unit vectors. These describe wall geometry, not verified structural attachment suitability. Preview mode is currently `generated`, using the existing model preview renderer; no placeholder thumbnail is required.

To add a type, create its folder and manifest, add its entry to `index.json`, and register its JSON import in `src/scenes/typology/index.ts`. Set `defaultTypologyId` to activate it. Interactive type switching is not yet implemented. Version 1 requires zero yaw because site boundaries and placement directions are axis-aligned; orient the exported model accordingly. Invalid calibration or installation-wall data fails at startup.
