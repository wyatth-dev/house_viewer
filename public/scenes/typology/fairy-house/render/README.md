# Fairy house representations

The calibrated `../model.glb` export of `House_Fairy_source.3dm` is the common massing baseline. Neither the Rhino source nor the white asset is overwritten. Front / Back / Left / right reference surfaces, installation metadata, columns, origin and units remain fixed.

- White: original simplified shell.
- Color blocks: roof / horizontal siding / vertical siding / white trim / stone colour and texture cues; simple roof thickness and eaves, without openings.
- Detailed render: the same massing with recessed windows, entry and patio doors, garage door, dormer windows, gable vents. Rectangular regions are removed from their original wall or roof triangles, then separate reveal, frame and glazing geometry is added. Glazing is opaque blue-grey in this first preview; interiors are not modelled.

Opening sizes and locations are approximate interpretations of the supplied Graceview images, not measured construction data. Both existing dormer volumes retain their shared coordinates and shallow roof slopes. Any future correction to their massing must be made in the shared baseline and all variants regenerated.

Roof thickness (120 mm) and eave projection (180 mm) are initial visual estimates. Tiny triangulation fragments and internal roof edges are excluded from eave generation to avoid stray white fascia and ridge spurs. Textures are procedural approximations with embedded base colour and normal maps. The legacy Restored house floor remains in the asset for correspondence; the application and preview disable it.

Rebuild: `python3 scripts/typology/prepare-fairy-render.py`.
Verify reference alignment: `python3 scripts/typology/verify-fairy-render.py`.
Verify openings remove their original surface: `python3 scripts/typology/verify-fairy-openings.py`.
Inspect variants: `/fairy-material-preview.html` on the Vite development server. The separate preview does not wire the main application’s Full render button.

## Front entry correction

The shared white baseline now includes the front-left room facade at z = -2301 mm, left and porch-side return walls, a right porch post and a local porch deck. These additions fill the missing room under the original small gable. The entry rear wall remains at z = -5088 mm and the garage front remains at z = 0 mm. The original 31 meshes, named reference faces and installation metadata are unchanged; all three variants use the same corrected baseline. The front-left window is now on the projecting room facade.

The prior white baseline is backed up at `assets/typology/fairy-house/source/base-before-entry-repair.glb`. Reapply the correction with `python3 scripts/typology/repair-fairy-entry.py`, then regenerate variants. An editable Rhino copy is saved beside the original as `House_Fairy_source_entry-repaired.3dm`; it adds the same room and porch surfaces while retaining the original document.

## Dormer proportion study

Front dormer facade height is reduced from approximately 1184 to 1040 mm. Rear dormer width is reduced from approximately 3190 to 2800 mm, centred on its original axis, while the facade height increases to 1244 mm. Window proportions follow these changes. Roof intersection edges move along the main roof slope. These are visual estimates from perspective reference images.

Reapply in order: `repair-fairy-entry.py`, `repair-fairy-dormers.py`, `prepare-fairy-render.py`. Backups preserve each previous baseline. `House_Fairy_baseline_repaired.3dm` is the current common baseline as editable Rhino meshes in the original Rhino axes and mm units; the original Brep source is retained separately.
