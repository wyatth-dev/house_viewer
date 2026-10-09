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
| `npm run dev:web` | Front end only; the built-in typologies render, but Your projects, saving, photo typologies and intake all need the service |
| `npm test` / `npm run test:service` | Front-end tests / Python service tests |

Environment variables: `FACADE_HTTP_PORT` (default 8765), `FACADE_DATA_DIR` (default `./data`), `FACADE_AUTORUN=0` (no automatic modelling), `FACADE_CLAUDE_BIN` (path to `claude` if it is not found automatically).

If an older Node is selected on this Mac, the existing Homebrew installation can be selected for the current terminal with:

```sh
export PATH="/opt/homebrew/opt/node/bin:$PATH"
node -v
```

## Your projects

`/` is the **Your projects** home page: one card per project (thumbnail of its house, name, last updated), with New project, rename and delete (deleting also removes the project's photo models). A project is a complete design: which house, the four yard clearances, placed products and the display settings (representation, trees, fence, dimensions). Opening a card goes to `/?project=<id>`.

Edits are saved automatically; there is no save button. The row above the panel shows the project name (click to rename), the save status (Saved / Saving… / Not saved · Retry) and a link back to Your projects. Saves are debounced by 800 ms; after a failure they are retried after 2 s, 5 s and 15 s, then every 30 s, while editing continues from the in-memory state. Each save carries the project's `revision`. If the project was changed elsewhere (for example in another tab) the service answers 409, autosave stops and the page offers **Reload** (take the server's version) or **Keep mine** (save the local state over it). Closing the page with unsaved edits sends a last save and otherwise asks for confirmation.

On open the editor restores the house, then the yard, display settings and products. Products that no longer fit (the wall is gone or validation fails) are skipped with a note in the status bar. If the project's photo house was deleted it falls back to the Fairy house with no products, and the corrected state is saved once. Switching house clears the placed products.

Pages: `/` (home), `/?project=<id>` (editor), `/?project=<id>&photo=new` and `/?project=<id>&photo=<model-id>` (photo intake for a new or existing photo model). The former `?typology=` URL parameter has been removed; the browser back button no longer switches houses.

A project the service cannot read (`project.json` corrupt or an unknown `schemaVersion`) is shown as unavailable and is never overwritten. If the service is not running the home page says so; start it with `npm run dev`. Existing data from before projects (`data/intake/`, `data/typologies/`) is copied once into a project called "My first project" (`p-0001`) on first start; see `data/README.md`.

## New typology from photo

The Typology section has two groups: **Preset** (round icons, bundled in `public/`) and **From photo**; each group scrolls sideways when it overflows. **New from photo** (or the edit button on a photo card) opens photo intake inside the same page, in place of site setup (`/?project=<pid>&photo=new` or `&photo=<model-id>`; the former `/intake.html` page has been removed). Upload photos of one facade (the wall width is optional). Modelling starts automatically and the model appears in the scene; when it is submitted, the latest build is published as a typology and appears in the typology list. Choosing another typology swaps the house in place (same fade as representation changes): camera, lighting, landscape and yard dimensions stay; placed products are cleared because they belong to the previous house's walls. The choice is saved in the project. Thumbnails: presets use static `preview.png` files; a photo typology's thumbnail (stored in the project) is rendered from its render model when it is opened and stored by the service.

Photo typologies use the same contract as the built-in ones (`scene.json` + white / color-block / render GLBs, millimetres, front = +Z) with one installation face, `facade-main`. The upload panel has one entry per facade (Front / Back / Left / Right; one facade is modelled at a time, photos and widths are kept per facade). The modelled facade is placed on that side of the house (installation face `side`), so a back-garden photo faces the back yard and the other walls are plain. Modelling details, tools and limits: `services/facade-modeler/README.md`.

## Rendering (AI render)

Step 03 (Rendering) turns model views into photorealistic images with the OpenAI image API.

- **Setup**: copy `.env.example` to `.env` in the repository root and set `OPENAI_API_KEY` (model: `OPENAI_IMAGE_MODEL`, default `gpt-image-2.5-flare`). The service reads `.env` when it starts; restart `npm run dev` after changes. `.env` is ignored by git.
- **Context** (the bar above 01): photos of the real house and garden, sent with every render as material and mood references. A photo-built house puts its original photo in by default; deleting it only removes it from Context (the house model is unchanged) and it is not added back until a different photo house is chosen. Upload more by clicking or dropping files.
- **Rendering Queue**: the camera tile captures the current view. Hover a card for **Render** and for delete (top right). While rendering the card shows a spinner; when done it shows the render, and clicking it opens the before/after comparison (drag the handle; other rendered views are listed below). **Render again** sits in the card's corner.
- **Look & atmosphere** (below Context): style (default Commercial), time of day, weather and season. The choice is saved in the project and applies to the next render; the comparison shows which settings a render used. The buttons come from `prompts/options.toml`.
- **Prompt**: plain text files in `prompts/` at the repository root: `render.txt` (always sent) and `render-context.txt` (added when there are Context photos). Refer to the images with the parameters `{capture}` and `{context}` (see `prompts/README.md`); the service fills in the image numbers. Edit freely; they are read for every render, no restart needed. The prompt actually sent is kept in `data/projects/<pid>/media/renders/<rid>/prompt.txt`.

## Files and data

```text
src/                 Front-end code only (one page: index.html → src/main.ts)
public/              Static assets bundled with the app, including the built-in typologies (seed data)
services/
  facade-modeler/    Python modelling service (uv project): HTTP API, MCP tools, GLB builder
data/                Local data store standing in for a database; not in git (see data/README.md)
  projects/
    index.json       Catalogue of projects (what the home page lists)
    <pid>/           One project: project.json (the saved design, revision-checked)
      photo-models/<mid>/  Photo intake workspaces: photos, spec, builds/vN, job logs
      typologies/          This project's published photo typologies + index.json
  intake/ typologies/  Legacy layout, copied into p-0001 on first start, then unused
scripts/dev.mjs      The one-command launcher behind npm run dev / npm start
```

The front end never writes files. It reads built-in typologies from `public/` and everything else through the service; only the service writes to `data/`.

| Purpose | Endpoint |
| --- | --- |
| List / create projects | `GET` / `POST /api/projects` |
| Read / save / delete a project | `GET` / `PUT` / `DELETE /api/projects/<pid>` (a save carries `revision`; stale gives 409 with the current document) |
| Rename (used by the home page; the editor renames through autosave) | `PUT /api/projects/<pid>/name` |
| Photo models: list / upload | `GET` / `POST /api/projects/<pid>/photo-models` |
| Photo model: detail, rename, run, publish | `GET …/photo-models/<mid>`, `PUT …/name`, `POST …/run`, `POST …/publish` |
| Photo model files | `GET /files/<pid>/<mid>/<path>` |
| Published photo typologies | `GET /api/projects/<pid>/typologies`, `DELETE …/<mid>`, `PUT …/<mid>/preview` |
| Published typology files | `GET /data/projects/<pid>/typologies/<mid>/<path>` |

The earlier global endpoints (`/api/uploads`, `/api/typologies…`, `/data/typologies/…`) have been removed.

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
  typology/                 # Typology catalogue (presets + photo typologies), validation and the active typology
  projects/                 # Your projects: home page, project document, API client, autosave, project bar
  photo-intake/             # Embedded photo intake: controller, service API, panels, photo dimensions
  products/
    parametric-engine/varenda/ # Parameters, catalog, datums and engineering relationships
    varenda/view/             # Product model manifest and PlayCanvas rendering adapter
  scene/
    house/                    # House loading and verified calibration
    model-preview/            # One-shot model thumbnail
  shared/
    assets/                   # Generic GLB loading and scene-owned resource store
    camera/                   # Camera fitting, transitions, projection and view controls
    geometry/                 # Scene types and unit conversion
    lifetime.ts               # Abort and resource disposal
```

`/` (the only page) loads `src/main.ts`: without `?project=` it shows the Your projects home (`src/projects/home.ts`); with it, it loads the project (`src/projects/`: document types and validation, API client, autosave), resolves its house (Fairy house if missing) and then imports and calls `startSiteDefinition()`, which restores and autosaves the project. Photo intake runs inside the same page: `src/photo-intake/controller.ts` is created by `start.ts` and reuses its scene, camera and typology switching. The main workflow includes site setup, product placement, parameter editing and production-list navigation. Unknown page URLs return 404. The former independent customization page and lab route have been removed.

`products/` owns product definitions and rendering metadata. Its `parametric-engine/` contains product-specific engineering modules and can later support other products alongside Varenda. Engineering has no DOM, PlayCanvas or GLB dependency. The view consumes engineering results and maps their coordinates into the scene. `products/varenda/view/assets.ts` lists model URLs and source sample lengths; downloadable GLBs remain at stable URLs in `public/models/varenda/`.

`product-placement/` owns the product editing flow, production-list display groups and selection state. Site Definition's `dimension-inputs.ts` owns yard inputs. Site rendering surfaces in `site-definition/materials/` are distinct from the production material list.

`shared/camera/` does not depend on Site Definition; Site Definition composes the shared camera through its startup, presets and scene coordinator. Camera fitting receives generic bounds; site labels receive a projection callback. `site-definition/scene-controller.ts` coordinates these public interfaces. Typology thumbnails render the loaded model geometry and materials once at 320 × 240, through an isolated layer and orthographic camera. The temporary GPU resources are released after PNG encoding; the image URL is cached for the model lifetime and revoked on disposal. No extra GLB download or continuous thumbnail render loop is used. Camera and yard edits keep the same image.

View changes do not rebuild the site. Separate control sections share one panel.

## Repository root

- `src/`, `public/`, `tests/`: application code, served assets and tests.
- `scripts/site-definition/`: site material integrity checker. Site texture source and license records live in `src/site-definition/materials/sources/`; served textures live in `public/site-definition/materials/`. Product models and their materials remain with the corresponding product assets.
- `docs/`: designs, plans, material import instructions and development history (`history/`).
- `index.html`: the single application page.
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

The main workflow defines the site and supports Varenda placement, parameter editing and production-part inspection. Edits are saved per project (see Your projects). It does not modify the house mesh, support sloped terrain or irregular boundaries, place furniture, or provide panning. Measurement lines are drawn over geometry so they stay legible; they are explanatory overlays, not visibility/occlusion measurements. Ground colors are configured in `src/site-definition/ground.ts`. Remote Google Fonts enhance typography; system sans-serif fonts remain usable offline.

See [the implementation plan](docs/plans/2026-09-28-house-scene-configuration.md) and [execution notes](docs/plans/2026-09-28-house-scene-configuration-progress.md).

## Daylight environment

`src/site-definition/rendering/config.ts` controls the sunny preset. A locally generated sky panorama supplies the background and filtered environment lighting; no downloaded HDR asset is included. One warm directional light casts filtered shadows. A muted textured plane extends beneath and around the editable site. Existing house and yard materials are retained, but their displayed brightness changes under the new lighting and ACES tone mapping.

The app passes generic scene bounds to the rendering module to update surroundings and shadow coverage. Camera far clipping is extended to keep the background visible during view transitions, without enlarging the bounds used to frame the house. Sky/lighting textures are generated once and released on disposal; shadows render in real time. This first preset does not include photographic scenery, detailed grass geometry, or animated weather.

## Exterior PBR materials

The surroundings now use a locally hosted short green grass material (ambientCG Grass001) outside the editable property. A validated manifest drives the independent `src/site-definition/materials/` loader; the terrain renderer owns the mesh and repetition treatment. The default 1K profile downloads approximately 4.53 MiB and uses approximately 16 MiB of texture memory including mipmaps. A 2K profile is available through `src/site-definition/rendering/config.ts`.

See [the material import workflow](docs/materials/import-workflow.md) for texture conventions, physical scale, source licenses, source imports, validation and known limits. Run `npm run materials:check` to verify all packaged texture hashes and metadata.

## Customization and production preview

After site setup, select and place a Varenda on an available house wall. Select a placed product to edit parameters or inspect its Production List. Installed components are grouped by material and specification, with placeholder thumbnails and explicit pending metadata. Selecting a row frames and highlights its instances and fades other components. Invalid parameter drafts retain the last valid product and list.

Expanded production rows support individual instance focus (including each Post column). Related-part navigation follows shared column IDs, fixing-plate fastener references, end-cap connections and glazing installations. Each related component can be focused separately and navigated back to the originating instance or the full group. Post fastening schedules remain undefined, so post connections currently expose the matching footing only.

## Typology scene inputs

`public/scenes/typology/index.json` lists available house types and the default ID. Each type owns a folder containing `scene.json` and `model.glb`. Runtime metadata is imported through `src/typology/index.ts`; the panel, house calibration and installation walls read the active typology (`activeTypology()`), which can be switched at runtime.

Version 1 manifests declare `id`, `name`, a relative `model` path, millimetre units, +Y up and +Z front axes, preview mode, calibration and installation faces. Wall origins and lengths use the original model coordinates, before centering and scaling; the loader applies the same calibration as the house. Wall IDs must be unique; along-wall and outward directions must be perpendicular unit vectors. These describe wall geometry, not verified structural attachment suitability. Preview mode is currently `generated`, using the existing model preview renderer; no placeholder thumbnail is required.

To add a type, create its folder and manifest, add its entry to `index.json`, and register its JSON import in `src/typology/index.ts`. Set `defaultTypologyId` to activate it. Version 1 requires zero yaw because site boundaries and placement directions are axis-aligned; orient the exported model accordingly. Invalid calibration or installation-wall data fails at startup.
