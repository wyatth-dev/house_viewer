# Sunningdale house representations

Redrow Heritage “The Sunningdale” (G Series, Eco Electric), four-bedroom detached house with an integral single garage. All three states are generated from one parametric baseline, `scripts/typology/sunningdale_baseline.py`; none is edited by hand.

## Evidence and estimates

- Plan dimensions come from the Redrow floor-plan PDF (EG_SUND_DM.2, 09.02.2023), scaled against the room schedule (garage 5.64 × 4.97 m, lounge 5.12 × 3.56 m) and rounded to 100 mm.
- Envelope 11 300 × 10 400 mm. Two-storey body 11 300 × 6 800 mm. Front gable wing 4 000 mm wide, 9 900 mm deep. Garage 5 500 mm wide; its front 3 600 mm is single storey. Entry recess 1 800 mm wide, door at 8 100 mm from the rear wall.
- **Estimated (no elevation drawing):** ground storey 2 700, eaves 5 200, main ridge 8 090, front gable ridge 6 900, garage eaves 2 700 and hipped ridge 4 600 mm. Main and front gable pitch ~40°, garage ~35°. The flat entry canopy and all opening sizes and positions are interpretations of the plan symbols.
- Materials follow the SOP vocabulary (slate roof, horizontal siding, vertical gables, white trim, stone plinth), not Redrow's actual brick finish.

## States

- White: thin shell, `WhiteModel_Roof` / `WhiteModel_Wall`. No openings, roof thickness or overhang.
- Color blocks: six SOP materials with procedural textures. Stone below 520 mm, horizontal siding up to the 5 200 mm eaves, vertical siding in the gables. 120 mm roof skin grown upward, 180 mm eaves/verge projection, continuous fascia. Edges at valleys, ridges, hips and roof-to-wall or roof-to-canopy junctions get no fascia. No openings.
- Detailed render: Color blocks plus 17 openings: garage door, entry door, rear patio doors, 13 windows and a gable vent. Each one is cut from its facade, with a 170 mm reveal, recessed glazing and a proud 75 mm frame. Door frames stop at ground level.

Named walls `Front` (garage front, z = 0), `Front_Wing` (z = −500), `Back` (z = −10 400), `Left` (x = −11 300) and `right` (x = 0) carry the five installation faces in `scene.json`. They are identical in every state.

Rebuild: `python3 scripts/typology/prepare-sunningdale.py`
Verify: `python3 scripts/typology/verify-sunningdale.py`
Rhino library: `python3 scripts/typology/export-sunningdale-rhino.py` (requires `rhino3dm`). It writes `CeluplastVS/resources/modelling/House_Sunningdale/`. From a mounted copy, set `SUNNINGDALE_CAD_DIR` and `SUNNINGDALE_TEXTURE_ROOT`.
