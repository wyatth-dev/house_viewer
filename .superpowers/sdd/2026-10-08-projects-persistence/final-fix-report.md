# Final whole-branch review: fix report

Branch feat-projects. Commits: e51b2a0 (finding 1), b984720 (findings 3 and 4), 5bceaba (finding 2).

## Finding 1 (CRITICAL): transient failures no longer wipe the saved house

Fix (src/typology/catalog.ts): new `TypologyNotFoundError`; strict `fetchPhotoTypologies` throws on network error, non-OK status, unparseable body or `ok: false`. `listTypologies` still degrades to presets for the panel. `loadTypology` throws TypologyNotFoundError only for an unknown preset id without a project, an id absent from a successfully read list, or a 404 for scene.json; other scene.json failures throw a plain Error. `resolveTypology` falls back to Fairy only on TypologyNotFoundError and rethrows everything else, so main.ts returns to the home page (5xx and TypeError show the 'service is not running' reason) and nothing is saved.

Tests (tests/typology-resolve.test.mjs): list 500 rejects; list network error rejects; list ok + scene.json 500 rejects; list ok + scene.json 404 falls back; unknown preset id falls back (no request); unparseable list rejects; existing 'id absent falls back' kept.

RED:
```
ok 1 - listTypologies maps the legacy row projectId to photoModelId and tags the user project
ok 2 - resolveTypology falls back to Fairy when the photo typology is missing
not ok 3 - resolveTypology rejects when the typology list request fails (500) and does not fall back
not ok 4 - resolveTypology rejects when the typology list request has a network error
not ok 5 - resolveTypology rejects when the list is ok but scene.json answers 500
ok 6 - resolveTypology falls back when the list is ok and scene.json answers 404
ok 7 - resolveTypology falls back for a preset id that is not a known preset
not ok 8 - resolveTypology rejects when the typology list response cannot be parsed
# pass 4
# fail 4
```
GREEN:
```
ok 1 - listTypologies maps the legacy row projectId to photoModelId and tags the user project
ok 2 - resolveTypology falls back to Fairy when the photo typology is missing
ok 3 - resolveTypology rejects when the typology list request fails (500) and does not fall back
ok 4 - resolveTypology rejects when the typology list request has a network error
ok 5 - resolveTypology rejects when the list is ok but scene.json answers 500
ok 6 - resolveTypology falls back when the list is ok and scene.json answers 404
ok 7 - resolveTypology falls back for a preset id that is not a known preset
ok 8 - resolveTypology rejects when the typology list response cannot be parsed
# pass 8
# fail 0
```

## Findings 3 and 4: preview builds are not saved; restore is a tested module

New src/projects/restore.ts: `houseOf`, `isListed`, `FELL_BACK` (moved from start.ts), `recordForSwitch(doc, entry)` (null for an unpublished build or the same house, else new house + products []), and `restoreProject(doc, activeHouse, editor, scene)` (gate on; dimensions, then display (landscape, Dimensions, representation), then products unless fell back; gate off; one corrected record when fell back / invalid yard / skipped products; returns the notice, or null if disposed). start.ts calls it with a scene adapter holding the same PlayCanvas calls as before; behaviour is unchanged (fallback still compares typology ids).

start.ts switchTypology: records only via recordForSwitch. While an unpublished build is shown (`previewing`), placement onChange is not recorded, so product edits on the preview cannot overwrite the saved house's products. Switching back to the saved house (recordForSwitch null, listed) re-applies the saved products under the restore gate, so the scene and the saved doc agree.

Tests (tests/project-restore.test.mjs, real createAutosave + createEditorState, fake save and manual timers, fake scene that fires editor.record on every step):
- opening a project saves nothing during restore and nothing at all when it is unchanged (asserts step order dimensions, display, representation, products and 0 saves at each step)
- a house that no longer exists falls back to Fairy, drops products and saves exactly once
- skipped products are reported and the corrected state is saved once
- recordForSwitch ignores a not yet published photo build / keeps products for the same house / stores a new listed house and clears products

RED:
```
#     throw new ERR_MODULE_NOT_FOUND(
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/claude/hvw/src/projects/restore.ts' imported from /home/claude/hvw/tests/project-restore.test.mjs
#   code: 'ERR_MODULE_NOT_FOUND',
not ok 1 - tests/project-restore.test.mjs
# pass 0
# fail 1
```
GREEN:
```
ok 1 - opening a project saves nothing during restore and nothing at all when it is unchanged
ok 2 - a house that no longer exists falls back to Fairy, drops products and saves exactly once
ok 3 - skipped products are reported and the corrected state is saved once
ok 4 - recordForSwitch ignores a not yet published photo build (temporary preview)
ok 5 - recordForSwitch keeps the products when the house does not change
ok 6 - recordForSwitch stores a new listed house and clears its products
# pass 6
# fail 0
```

## Finding 2: ESLint

`eslint --fix` for import order (start.ts, product-placement/controller.ts) and the type-specifier style (projects/api.ts). The empty `.catch(() => {})` handlers in start.ts (including the 2 that were already in base) and the console.warn stub in the test are now `() => undefined` with a comment explaining why. Per-file errors (base 3484bf1 vs now):
```
src/main.ts base=0 now=0 
src/photo-intake/api.ts base=0 now=0 
src/photo-intake/controller.ts base=0 now=0 
src/photo-intake/panels/photos-panel.ts base=0 now=0 
src/photo-intake/panels/status-panel.ts base=0 now=0 
src/photo-intake/panels/upload-panel.ts base=2 now=2 
src/product-placement/controller.ts base=2 now=0 
src/projects/api.ts base=new now=0 
src/projects/autosave.ts base=new now=0 
src/projects/editor-state.ts base=new now=0 
src/projects/home.ts base=new now=0 
src/projects/project-bar.ts base=new now=0 
src/projects/restore.ts base=new now=0 
src/projects/state.ts base=new now=0 
src/site-definition/panel.ts base=0 now=0 
src/site-definition/start.ts base=2 now=0 
src/typology/catalog.ts base=0 now=0 
src/typology/index.ts base=0 now=0 
tests/autosave.test.mjs base=new now=0 
tests/editor-state.test.mjs base=new now=0 
tests/photo-intake-controller.test.mjs base=0 now=0 
tests/placement-persistence.test.mjs base=new now=0 
tests/project-restore.test.mjs base=new now=0 
tests/project-state.test.mjs base=new now=0 
tests/typology-resolve.test.mjs base=new now=0 
```
No file has more errors than at base; all new files have 0. (Before the fix: controller 2->3, api.ts new 1, start.ts 2->8, typology-resolve test new 1.)

## Checks

- `npx tsc --noEmit`: no output, exit 0
- `npm test`: # tests 181 # pass 161 # fail 20 ; `comm -13 baseline-fail.txt fail-now.txt` is empty (all 20 failures are the baseline ones)
- `npx vite build`: built in about 0.8 s (only the existing chunk-size warning)
- facade-modeler pytest: 141 passed

## Notes

- main.ts maps a 5xx error message to 'The project service is not running'; a scene.json 5xx now surfaces through that path too.
- Re-applying the saved products when switching back to the saved house is a small addition needed to keep findings 3's 'keep products' consistent with what the scene shows.

## Re-review finding (Important): edits lost after previewing an unpublished build of the saved house

Commit 5e61d83. Cause: an unpublished build's scene.json id equals the published typology id (the photo model id), so after Back the scene stayed on the preview with `previewing` true, and choosing the saved house in the panel was skipped by the id-only check. Every later product change was then dropped while the bar showed Saved.

Fix:
- src/projects/restore.ts: `sameTypology` compares id and baseUrl. `planSwitch(doc, active, entry, supplied)` returns skip / previewing / record / replaceSaved. `previewExit(doc, previewing)` returns the saved house id to return to.
- src/site-definition/start.ts: switchTypology uses planSwitch, so selecting the published house while its preview is shown really switches and re-places the saved products. New `scene.leavePreview()` switches back to the saved house when a preview is shown. A product change made while previewing (for example if returning failed) shows the status 'This build is not published yet: product changes on it are not saved.' instead of dropping it silently.
- src/photo-intake/controller.ts: closePhoto (Back; its only caller passes no id, so the dead id branch was removed) calls `scene.leavePreview()`. This also covers the `?photo=<mid>` deep link when the latest build is unpublished.

Tests: tests/project-restore.test.mjs 'previewing an unpublished build of the saved house (same id) and returning re-places the saved products' (preview `house-003` under /files/ = saved `house-003`), 'choosing the house already shown is a no-op; a new listed house is saved without products'; tests/photo-intake-controller.test.mjs 'Back to site setup asks the scene to leave a preview build, with or without a photo model id'.

RED:
```
ok 1 - opening a project saves nothing during restore and nothing at all when it is unchanged
ok 2 - a house that no longer exists falls back to Fairy, drops products and saves exactly once
ok 3 - skipped products are reported and the corrected state is saved once
ok 4 - recordForSwitch ignores a not yet published photo build (temporary preview)
ok 5 - recordForSwitch keeps the products when the house does not change
ok 6 - recordForSwitch stores a new listed house and clears its products
not ok 7 - previewing an unpublished build of the saved house (same id) and returning re-places the saved products
not ok 8 - choosing the house already shown is a no-op; a new listed house is saved without products
# pass 6
# fail 2
ok 1 - photo intake re-applies the site dimension state when it opens and when Dimensions changes
ok 2 - a photo deep link switches the model in and reads its annotations when another house is shown
ok 3 - opening the photo model already shown does not switch the house again
not ok 4 - Back to site setup asks the scene to leave a preview build, with or without a photo model id
# pass 3
# fail 1
```
GREEN:
```
ok 1 - photo intake re-applies the site dimension state when it opens and when Dimensions changes
ok 2 - a photo deep link switches the model in and reads its annotations when another house is shown
ok 3 - opening the photo model already shown does not switch the house again
ok 4 - Back to site setup asks the scene to leave a preview build, with or without a photo model id
ok 5 - opening a project saves nothing during restore and nothing at all when it is unchanged
ok 6 - a house that no longer exists falls back to Fairy, drops products and saves exactly once
ok 7 - skipped products are reported and the corrected state is saved once
ok 8 - recordForSwitch ignores a not yet published photo build (temporary preview)
ok 9 - recordForSwitch keeps the products when the house does not change
ok 10 - recordForSwitch stores a new listed house and clears its products
ok 11 - previewing an unpublished build of the saved house (same id) and returning re-places the saved products
ok 12 - choosing the house already shown is a no-op; a new listed house is saved without products
# pass 12
# fail 0
```

Checks after this fix:
- `npx tsc --noEmit`: exit 0
- `npm test`: # tests 184 # pass 164 # fail 20 ; no failures beyond the baseline (`comm -13` empty)
- ESLint comparison: no file worse than at 3484bf1; new files 0
```
src/main.ts base=0 now=0 
src/photo-intake/api.ts base=0 now=0 
src/photo-intake/controller.ts base=0 now=0 
src/photo-intake/panels/photos-panel.ts base=0 now=0 
src/photo-intake/panels/status-panel.ts base=0 now=0 
src/photo-intake/panels/upload-panel.ts base=2 now=2 
src/product-placement/controller.ts base=2 now=0 
src/projects/api.ts base=new now=0 
src/projects/autosave.ts base=new now=0 
src/projects/editor-state.ts base=new now=0 
src/projects/home.ts base=new now=0 
src/projects/project-bar.ts base=new now=0 
src/projects/restore.ts base=new now=0 
src/projects/state.ts base=new now=0 
src/site-definition/panel.ts base=0 now=0 
src/site-definition/start.ts base=2 now=0 
src/typology/catalog.ts base=0 now=0 
src/typology/index.ts base=0 now=0 
tests/autosave.test.mjs base=new now=0 
tests/editor-state.test.mjs base=new now=0 
tests/photo-intake-controller.test.mjs base=0 now=0 
tests/placement-persistence.test.mjs base=new now=0 
tests/project-restore.test.mjs base=new now=0 
tests/project-state.test.mjs base=new now=0 
tests/typology-resolve.test.mjs base=new now=0 
```
- `npx vite build`: built in 803 ms
