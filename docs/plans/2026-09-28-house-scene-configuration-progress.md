# Execution ledger — house scene configuration

Plan: docs/plans/2026-09-28-house-scene-configuration.md

- Existing checkout: clean site-definition feature branch, except subsequent user GLB update. Preserve the user model and backup.
- Ruling: use the existing feature checkout requested by the user, not a managed checkout of this chat’s different CeluplastVS repository. No main-branch edits.
- Baseline: typecheck passes; existing main.ts has two import lint errors.
- Preflight: house provides Footprint and Bounds3; site produces generic Bounds3; camera accepts Bounds3/Viewport; coordinator injects projection into labels. Camera and site never import each other.
- Ruling: use Node’s native test runner and .mjs tests importing erasable TypeScript, avoiding additional test dependencies. Tests live under tests/ rather than beside source.
- Calibration: user confirmed actual width 43 m. Raw width 43000 means scale 0.001. Named Front faces +Z, Left lies at X=-43000, right at X=0. Wall envelope includes rear extension at Z=-57000; Back is recessed at Z=-48000. Ground reference Y=0; slab bottom -100 is not ground reference.
- Ruling: use rectangular outer wall envelope as planned, including extensions; do not measure from recessed facade portions. Cost: this demo does not describe local clearances at every recess.
- Geometry and framing: tests observed failing against stubs, then passing (zero, asymmetric, maximum, portrait/wide/deep cases).
- Coordinator: test observed failing against stub, then passing. View and resize paths do not rebuild site geometry; invalid values do not refit.
- Repository docs were globally ignored. Remove docs ignore so the existing plan and implementation notes are versionable.
- Task 1: complete. Updated named model inspected; user confirmed width 43 m; wrapper scale 0.001 and 43 × 57 m wall envelope applied. Native loader tests cover failure and cancellation.
- Task 2: complete. Four retained planes, two shared materials, zero/asymmetric/maximum geometry tests passing.
- Task 3: complete. Four orthographic cameras, exactly one enabled; unknown IDs rejected; fitting tested on wide/deep/portrait bounds. Actual engine controller tested with NullGraphicsDevice.
- Task 4: complete. Independent dimension/view controls composed into one panel. Browser checks verified empty/negative values retain the last valid property, zero gives 43 × 57 m, and resizing keeps controls usable.
- Task 5: complete. Measurement overlays integrated through projection callback, cleanup implemented, README updated. 100 browser dimension edits preserved selected view and produced no console warnings/errors; native tests confirm 100 updates retain the same four surfaces/two test cameras.
- Visual regression fixed: initial PlayCanvas default FILLMODE_KEEP_ASPECT and fixed 300 × 150 backing buffer misaligned labels. Browser inspection confirmed mismatch; explicit FILLMODE_NONE + RESOLUTION_AUTO now gives canvas/viewport 980 × 720 and aligned labels.
- Independent code review completed. Important finding: pending model load could attach to disposed app. Added AbortSignal-aware loading and a resource lifetime owner; new tests observed RED → GREEN. Failure cleanup addressed in the same lifecycle change.
- Review follow-through: actual controller snapshot/unknown-ID tests added; coordinator imports public module entry points; README now documents this demo. No deferred review findings.
- Final verification: npm test 9/9; npm run typecheck PASS; npm run lint PASS; npm run build PASS. Build reports upstream worker_threads externalization and a 1.15 MB JS chunk (308 KB gzip), not build failures. Bundle optimization is outside this demo scope.
- Browser verification: all four buttons, 100 live edits, empty/negative drafts, all-zero dimensions, all-50 m dimensions at 390 × 844, reset to desktop/default dimensions. Final page has no console errors/warnings.
- Manual GLB network failure was covered through injected registry failure in native tests rather than altering the user model or live URL. Live startup succeeds with the supplied model.
- No additional test packages. Existing feature branch retained, no merge/push/deployment performed. User model and GLB backup left intact.

## Follow-up: panel order and perspective views

User requested Property size → Perspective → Dimensions, plus angled perspective Front/Back cameras while preserving Left/Right.

- Moved the site-owned summary into a dedicated panel slot above the view controls; dimension input and camera modules remain independent.
- Added optional projection/FOV settings to generic camera presets. Front/Back use 20° lateral angle, existing 40° elevation, and 45° vertical FOV. Left/Right keep their previous directions and orthographic projection.
- Added perspective bounds fitting with 15% margin and matching label projection. Caption switches between Perspective and Orthographic.
- Regression tests were observed failing against orthographic behavior, then passing with perspective fit/projection. Full suite: 11/11; typecheck, lint, and production build pass.
- Browser checks: both perspective views rendered; both side views retained orthographic projection; dimension edits update the relocated property summary; no console warnings/errors.

## Follow-up: animated view changes and typology

- Camera-owned 0.8-second orbit transitions blend pose and projection; measurement labels refresh via a generic movement subscription in the app layer.
- Rapid view changes retarget from the visible pose; reduced-motion users switch immediately. Resizing and dimension edits refit the selected view immediately.
- Tests cover intermediate framing, render/label projection agreement, and rapid retargeting. Browser checks showed moving views with aligned labels and no console errors.
- Added 01 Typology before 02 Your perspective and 03 Yard dimensions. The sole selected base model is Fairy house; the supplied GLB is unchanged. On tablet layouts Typology spans the panel width.

- Typology follow-up: replaced the radio control with a static SVG axonometric house illustration and Fairy house caption. This is a schematic thumbnail, not a second rendered GLB scene; it adds no render loop or camera.

## Follow-up: thumbnail generated from the actual model

- Replaced the schematic SVG with an independent model-preview module accepting an engine app, model entity, and bounds. It shares the loaded mesh/material resources and renders only those meshes through an isolated layer.
- A one-shot 320 × 240 orthographic axonometric capture becomes a cached PNG URL. Temporary light, camera, texture, and render target are released; disposal revokes the URL. Preview failure shows a fallback message.
- Browser verification confirms the actual model silhouette/materials, no console warnings/errors, and the same cached image after view and yard changes.
- Verification: 13 existing regression tests pass; typecheck, lint, and production build pass. Existing upstream bundle warnings remain.
