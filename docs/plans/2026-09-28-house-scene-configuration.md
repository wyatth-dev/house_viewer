# House Scene Configuration Demo — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task after the user requests implementation. Use checkbox steps to track progress. Do not start implementation as part of this planning request.

**Execution status (2026-09-28):** Implemented; see [verification and execution notes](2026-09-28-house-scene-configuration-progress.md). The design below is retained as the baseline; notes record implementation adaptations.

**Goal:** Let a user define a rectangular property around an existing house by setting four clearances, viewing two ground-material regions, and switching between four fixed cameras.

**Architecture:** Keep the house fixed after initial calibration. Separate reusable camera management from the site-definition feature, with independent state and public interfaces. An application coordinator connects site bounds to camera framing and camera projection to measurement labels; neither module imports the other. Compose their independent HTML controls into one panel.

**Tech stack:** Existing Vite, TypeScript, and PlayCanvas Engine project; HTML/CSS for controls and labels. Add a small TypeScript-compatible test runner only for the geometry and camera calculations.

**Spec:** The agreed design brief is recorded below. Proposed defaults are explicitly identified and can be adjusted during review.

**Implementation project:** `/Users/Celuplast/Documents/house-viewer`.

**Plan location:** `docs/plans/2026-09-28-house-scene-configuration.md` in this repository. Implementation paths below are relative to the repository root.

## 1. Agreed design brief

- The house keeps its physical size while the property boundary changes.
- Four independent dimensions represent front-yard depth, back-yard depth, left clearance, and right clearance.
- Start with a rectangular property aligned with the house.
- Provide four fixed camera views: Front, Back, Left, and Right. No orbit, drag rotation, or free camera controls.
- Use one material for the front yard, spanning the entire property width, including both front corners.
- Use a second shared material for the back yard and both side strips.
- The house-front line separates the front material from the side/back material.
- A single panel contains dimensions and view buttons.
- Show boundary and measurement information and update the scene when dimensions change.

### Proposed demo defaults

- Units: meters; one scene unit equals one meter after calibration.
- Initial dimensions: front 5 m, back 7 m, left 2 m, right 2 m. These are demo values, not measurements of the user's property.
- Allowed clearance: 0–50 m inclusive; input step 0.1 m. Bounds are product limits for this demo, not planning regulations.
- Initial view: Front; all views use orthographic projection with a fixed 40-degree downward viewing angle.
- Front material: muted warm paving, `#B8AA91`; side/back material: muted green, `#71866A`. Keep colors centrally configurable; use no texture downloads in the first version.
- Desktop panel: 300 px wide beside the viewport. Below 768 px window width, put the panel beneath the viewport. Never place the panel over the area used for camera fitting.
- No persistence, furniture placement, irregular plots, terrain editing, or model editing in this stage.

## 2. Global constraints

- Preserve the existing model at `public/models/house.glb` and its component hierarchy.
- Keep the installed PlayCanvas/Vite stack; do not replace the scaffold or introduce React.
- The existing project declares Node.js `>=22.23.2`; implementation and verification must use a compatible runtime.
- Establish model scale and orientation explicitly; do not infer them from a filename or arbitrarily resize the house to fit a convenient dimension.
- Measurements start at exterior-wall footprint reference planes, not automatically at roof overhangs or decorative geometry.
- Left and right are defined as seen by someone outside, facing the house's front facade.
- A dimension update must not rescale or rotate the house.
- Exactly one camera is enabled at any time.
- Zero-width ground regions are hidden rather than created as degenerate geometry.
- Invalid inputs must never send NaN, Infinity, or negative dimensions into scene transforms.

## 3. Existing implementation

`src/main.ts` initializes the graphics device, registers render/camera/light systems and texture/container handlers, loads the GLB, and merges mesh bounds to position one perspective camera. `index.html` contains a full-window canvas and `src/style.css` provides basic page styles.

Retain the working initialization and asset-loading approach. Extract responsibilities as the new flow is added. Remove the temporary `direction` entity that is created and immediately destroyed; it has no function. Replace the current full-window canvas sizing with sizing to the actual viewport container.

## 4. Coordinate and geometry contract

Use a calibrated house-local coordinate system:

- +Y: up.
- +Z: toward the front property boundary.
- -Z: toward the back property boundary.
- -X: left; +X: right.

Translate the calibrated exterior-wall footprint center to X=0, Z=0 and its ground reference to Y=0. Apply scale/orientation/translation to a wrapper entity so original child names are preserved. Mesh render bounds remain useful for camera fitting, but are a separate concept from the wall footprint.

Let house footprint width be W, depth be D, and clearances be F, B, L, R:

```text
x boundary =  W/2 + R
-x boundary = -W/2 - L
+z boundary =  D/2 + F
-z boundary = -D/2 - B

Property width = W + L + R
Property depth = D + F + B
```

Build four non-overlapping rectangles on Y=0:

| Region     | X interval            | Z interval       | Material |
| ---------- | --------------------- | ---------------- | -------- |
| Front      | entire property width | D/2 to D/2 + F   | Front    |
| Back       | entire property width | -D/2 - B to -D/2 | Shared   |
| Left side  | -W/2 - L to -W/2      | -D/2 to D/2      | Shared   |
| Right side | W/2 to W/2 + R        | -D/2 to D/2      | Shared   |

The back rectangle owns the back corners; the front rectangle owns the front corners. No rectangle covers the house footprint. Raise boundary/measurement lines slightly above the surface to avoid flicker.

## 5. File organization and module boundaries

Paths below are relative to the implementation project. Organize by responsibility rather than collecting unrelated functions in a generic scene folder.

| File                                  | Responsibility                                                      |
| ------------------------------------- | ------------------------------------------------------------------- |
| `src/main.ts`                         | Engine bootstrap and application lifecycle                          |
| `src/app/scene-controller.ts`         | Compose modules, combine bounds, route updates and cleanup          |
| `src/geometry/types.ts`               | Domain-neutral Point3, Bounds3, Viewport, and Projection types only |
| `src/house/house.ts`                  | Load/calibrate model and report wall footprint and render bounds    |
| `src/house/house-config.ts`           | Verified scale, orientation, ground reference, wall footprint       |
| `src/house/types.ts`                  | Calibrated house and Footprint contract                             |
| `src/camera/index.ts`                 | Camera module public exports                                        |
| `src/camera/types.ts`                 | CameraPreset, CameraState, and CameraController contracts           |
| `src/camera/controller.ts`            | Camera entity lifecycle, active selection, projection, framing      |
| `src/camera/framing.ts`               | Pure orthographic fit calculations                                  |
| `src/camera/controls.ts`              | View buttons, driven by presets and callbacks                       |
| `src/camera/framing.test.ts`          | Projection/framing edge cases                                       |
| `src/app/camera-presets.ts`           | App-specific Front/Back/Left/Right preset definitions               |
| `src/site-definition/index.ts`        | Site module public exports                                          |
| `src/site-definition/types.ts`        | Dimensions, SiteSide, SiteState, Rect, Layout contracts             |
| `src/site-definition/controller.ts`   | Own valid site state and coordinate site rendering                  |
| `src/site-definition/layout.ts`       | Pure validation and rectangle calculations                          |
| `src/site-definition/ground.ts`       | Ground regions, materials, and property outline                     |
| `src/site-definition/controls.ts`     | Dimension fields, validation, and property summaries                |
| `src/site-definition/measurements.ts` | Measurement lines and projected HTML labels                         |
| `src/site-definition/layout.test.ts`  | Geometry and invalid-input cases                                    |
| `src/app/scene-controller.test.ts`    | Module coordination with fake public controllers                    |
| `src/ui/panel.ts`                     | Shared panel shell; mounts independent control sections             |
| `src/style.css`                       | Viewport/panel layout and control/label styles                      |
| `index.html`                          | Accessible viewport, panel, status, and overlay containers          |

### Dependency rules

- `camera/` must not import `site-definition/`, `house/`, or `app/`; it receives generic bounds, viewport dimensions, and camera presets.
- `site-definition/` must not import `camera/` or `app/`. It may consume the house Footprint type and neutral geometry contracts, but does not own cameras.
- SiteSide and camera preset IDs are independent types. The site's four regions must not use a camera ViewId as their keys.
- `app/scene-controller.ts` is the composition boundary. It imports public module entry points, combines house/site bounds, and wires callbacks.
- `ui/panel.ts` only composes HTML sections. Camera controls own view-button behavior; site controls own dimension-input behavior.
- Keep camera and site state separate. Do not create a shared mutable SceneState or global event bus.
- Future camera modes should be implementable inside `camera/` and application preset configuration without changing yard calculations. Future site shapes should change site layout without changing generic camera fitting.

### Public contracts

```ts
// geometry/types.ts — neutral transport values
 type Point3 = { x: number; y: number; z: number };
 type Bounds3 = { min: Point3; max: Point3 };
 type Viewport = { width: number; height: number };
 type Projection = { x: number; y: number; visible: boolean };
 type ProjectPoint = (point: Point3) => Projection;

// camera/types.ts
 type CameraPreset = { id: string; label: string; direction: Point3 };
 type CameraState = { activePresetId: string };
 interface CameraController {
   setView(id: string): void;
   fit(bounds: Bounds3, viewport: Viewport): void;
   getState(): Readonly<CameraState>;
   project: ProjectPoint; // viewport-local CSS pixels
   destroy(): void;
 }

// site-definition/types.ts
 type SiteSide = 'front' | 'back' | 'left' | 'right';
 type Dimensions = Record<SiteSide, number>;
 type SiteState = { dimensions: Dimensions };
 type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
 type Layout = {
   property: Rect;
   regions: Record<SiteSide, Rect>;
   width: number;
   depth: number;
 };
 interface SiteController {
   setDimensions(value: Dimensions): Partial<Record<SiteSide, string>>;
   getState(): Readonly<SiteState>;
   getLayout(): Layout;
   getBounds(): Bounds3;
   refreshLabels(project: ProjectPoint): void;
   destroy(): void;
 }

// house/types.ts
 type Footprint = { width: number; depth: number };

// site-definition/layout.ts
 validateDimensions(value: Dimensions): Partial<Record<SiteSide, string>>;
 calculateLayout(house: Footprint, dimensions: Dimensions): Layout;
```

Getters return defensive snapshots; callers cannot mutate controller internals. Invalid `setDimensions` calls return field errors without changing valid state; successful calls return an empty object. Unknown camera IDs are rejected without changing the active camera. Controls emit callbacks; they do not manipulate PlayCanvas entities.

The application creates both controllers and supplies the configured presets. On valid dimension edits it updates the site, combines site/house bounds, calls camera `fit`, and refreshes labels with an injected projection callback. On a view switch it calls camera `setView` and refreshes labels only. On viewport resize it refits and reprojects without recreating site geometry. Future animated cameras can request label refresh through the coordinator, without introducing a camera dependency in the site module.

## 6. Review focus

1. Incorrect scale/front/wall footprint would make plausible-looking dimensions inaccurate: verify model calibration before building yard geometry (Task 1).
2. Asymmetric or zero clearances must not create overlaps, negative scales, or misplaced corners (Task 2).
3. An extremely wide or deep property must remain visible from every view, including on a narrow viewport (Task 3).
4. Empty, partial, or invalid field edits must not make the house disappear or silently overwrite user input (Task 4).
5. Slow/failed GLB loading and repeated updates/resizes must preserve a responsive UI without leaking entities/listeners (Tasks 1 and 5).

## 7. Implementation tasks

### Task 1: Establish a trustworthy house reference

**Files:** `src/main.ts`, `src/house/house.ts`, `src/house/house-config.ts`, `src/house/types.ts`.

**Produces:** A loaded house wrapper, calibrated `Footprint`, and world-space render bounds for camera fitting.

- [ ] Verify the Node runtime, current typecheck/build status, and GLB loading before changing application behavior. Record existing failures separately.
- [ ] Inspect the actual house orientation, dimensions, ground level, and roof overhangs. Compare against a known Rhino measurement. If scale or front is ambiguous, ask for that specific reference instead of guessing.
- [ ] Store the verified scale, rotation, ground reference, and wall footprint in `house-config.ts`; keep them separate from user-adjustable yard values.
- [ ] Extract model loading and calibration into `house.ts`, retaining the original child hierarchy.
- [ ] Show a loading status and keep scene controls disabled until valid model data is available. Show a readable error with a reload action if loading fails or produces no renderable meshes.
- [ ] Verify a known house dimension and its front direction visually; test failed loading using an intentionally unavailable model URL, then restore the real URL.

**Acceptance:** The house is correctly oriented, grounded, and measured in meters; failure produces a visible message rather than a blank page.

### Task 2: Calculate and render the property

**Files:** `src/site-definition/layout.ts`, `src/site-definition/layout.test.ts`, `src/site-definition/ground.ts`, `package.json` and lockfile only if adding the test runner.

**Consumes:** Calibrated `Footprint` and `Dimensions`.
**Produces:** Pure `Layout`, four reusable ground entities, property outline, and public `SiteController`; add `src/site-definition/controller.ts`, `types.ts`, and `index.ts` in this task.

- [ ] Add tests for an 8 m × 10 m house with F=5, B=7, L=2, R=3: property width=13, depth=22, X=[-6,7], Z=[-12,10].
- [ ] Assert front area=65, back area=91, left area=20, right area=30 square meters; total ground area=206, equal to property area minus footprint area.
- [ ] Add zero-clearance, asymmetric-clearance, and 50 m maximum cases. Assert non-overlapping interiors and no region beneath the house footprint.
- [ ] Run the tests to demonstrate missing behavior, implement the coordinate contract, and rerun successfully.
- [ ] Create four plane entities once; update their centers and sizes in place. Hide regions with zero area. Assign exactly two reusable materials.
- [ ] Render the property outline and verify the front material spans both front corners while the shared back material spans both back corners.

**Acceptance:** Every valid dimension combination produces the expected rectangular property and correct material partition, with no duplicate overlapping surfaces.

### Task 3: Add four fixed cameras

**Files:** `src/camera/{index,types,controller,framing}.ts`, `src/camera/framing.test.ts`, `src/app/camera-presets.ts`, `src/geometry/types.ts`.

**Consumes:** Generic combined `Bounds3`, `Viewport`, and app-configured `CameraPreset[]`; no house or site domain objects.
**Produces:** Independent `CameraController` with `setView`, `fit`, `getState`, `project`, and `destroy`.

- [ ] Define camera presets in the application configuration. Verify camera setup and fitting using only an arbitrary Bounds3 and viewport, with no house loader or site module instantiated. Test unknown preset IDs leave the active camera unchanged.
- [ ] Implement pure orthographic fit calculations using the projected corners of the combined house/property bounds. Fit horizontal and vertical extents using the actual viewport aspect ratio and 15% margin.
- [ ] Test all four orientations for the asymmetric sample property, a very wide plot, a very deep plot, and portrait/landscape viewport sizes. Assert every corner lies inside the fitted projection and clipping range.
- [ ] Create Front/Back/Left/Right orthographic cameras at fixed horizontal directions and 40-degree downward pitch. Set suitable near/far clipping planes from the combined scene bounds.
- [ ] Enable only the selected camera; default to Front. Switch immediately without orbiting or transition animation.
- [ ] Refit after dimension updates and viewport resizing. Keep the user's selected view unchanged.

**Acceptance:** All four views show the entire house/property, one at a time, without mouse-driven camera movement or clipping.

### Task 4: Build the dimension and view panel

**Files:** `index.html`, `src/ui/panel.ts`, `src/camera/controls.ts`, `src/site-definition/controls.ts`, `src/style.css`, `src/site-definition/layout.ts`, `src/site-definition/layout.test.ts`.

**Consumes:** Separate `SiteState`, `CameraState`, and preset metadata through their respective control sections. Emits independent dimension and preset-ID callbacks.

- [ ] Create a panel titled “Define your property” with Front yard, Back yard, Left clearance, and Right clearance number fields; show meters explicitly.
- [ ] Use proposed defaults and min=0, max=50, step=0.1. Keep draft input strings separate from valid numeric scene state.
- [ ] Update the scene on valid input events. On empty, non-finite, out-of-range, or negative values, retain the last valid geometry and show an inline field message. Do not silently clamp or replace the text while the user types.
- [ ] Add validation tests for zero, maximum, negative, above-maximum, NaN, and Infinity. Manually verify an empty draft and partial decimal entry without scene disappearance.
- [ ] Add Front/Back/Left/Right buttons with a visible selected state and `aria-pressed`. Show total property width and depth as read-only summaries.
- [ ] Lay out the panel beside or below the canvas as specified. Use container resizing rather than full-window canvas sizing; observe the viewport with `ResizeObserver`.
- [ ] Verify keyboard focus, number entry, button activation, and usable controls on a narrow screen.

**Acceptance:** Users can adjust all four dimensions and switch views using the panel, with clear feedback and no overlap between the panel and scene.

### Task 5: Add measurements and integrate updates

**Files:** `src/site-definition/measurements.ts`, `src/app/scene-controller.ts`, `src/app/scene-controller.test.ts`, `src/main.ts`, `src/style.css`, `README.md`.

**Consumes:** Site state, layout, footprint, and an injected `ProjectPoint` callback. The measurement module receives no camera controller or entity.

- [ ] Draw dimension lines from each wall reference plane to its corresponding property boundary. Use four labeled measurements formatted to one decimal place, e.g. “Front: 5.0 m”.
- [ ] Project measurement anchors through the active camera into an HTML overlay aligned to the canvas, not the browser window. Overlay labels must not intercept pointer events.
- [ ] Offset labels from measurement lines and prevent simple collisions; keep all four numeric values available in the panel when a view obscures a line. Handle a zero clearance without normalizing a zero-length vector.
- [ ] Implement coordination in `src/app/scene-controller.ts`: validate → site state/layout/ground → generic combined bounds → camera fit → projected labels. A view-only update calls `setView` and refreshes labels without touching site state or ground.
- [ ] Add coordinator tests using fake controllers: dimension edits invoke site update and camera fit; view switches never invoke site geometry updates; resizing does not change dimensions; label projection uses the active view. Review imports to enforce both module dependency rules.
- [ ] Add cleanup for owned entities, materials, event listeners, and resize observers, including development reload handling.
- [ ] Check 100 successive valid dimension changes and repeated resizes: ground and camera entity counts remain stable, the selected view persists, and the console stays free of errors.
- [ ] Document startup, model calibration, units, view conventions, material boundaries, and demo limitations in `README.md`.

**Acceptance:** Dimensions, ground, camera framing, and labels remain synchronized; the application remains stable during repeated interaction.

## 8. Verification and completion criteria

Run with a compatible Node runtime from the implementation project:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run dev
```

The implementation adds the `test` script if it does not exist. Automated checks must pass; inspect the rendered page as well, since a successful build does not verify visual placement.

Manual verification checklist:

- [ ] The model's physical dimensions and front facade agree with the Rhino reference.
- [ ] Front, back, left, and right refer to the same physical sides after every view switch.
- [ ] Initial and asymmetric clearances match the displayed measurement lines.
- [ ] All-zero clearances leave the property at the footprint without degenerate surfaces.
- [ ] Front corners use the front material; both side strips and back corners use the shared material.
- [ ] The house never changes size when any clearance changes.
- [ ] Every camera includes the complete scene after maximum-size edits and window resizing.
- [ ] Invalid field edits retain the last valid scene and explain how to correct the input.
- [ ] Loading failure is understandable and recoverable.
- [ ] Narrow layout has readable controls and a correctly sized viewport.
- [ ] Camera and site-definition modules have no imports of each other; the camera module works with synthetic bounds independently of any house/site implementation.

## 9. Delivery order and review

Deliver in this order: calibrated house → property geometry/materials → four cameras → panel → measurements and final verification. Each task is a reviewable unit; checkpoint completed source changes without committing generated dependencies or unrelated files.

This document is a plan only. Implementation begins after the user reviews the proposed defaults and requests execution. No further feature decisions should be inferred from the plan's out-of-scope list.
