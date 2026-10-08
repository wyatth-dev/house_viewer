# data/ — local data store

This folder stands in for a database and file store. Code never lives here, and nothing here is committed to git (except this README). The Python service (`services/facade-modeler`) is the only writer; the browser reads it through the service's HTTP API.

```text
data/
  intake/<project-id>/        Photo intake workspace, one folder per upload project
    photos/  rectified/       Original uploads and rectified elevations
    spec.json  ops.jsonl      House spec and the modelling operation log
    status.json               draft | submitted (+ the modeller's note)
    builds/v1 … vN/           Every build; builds/latest.json points at the last good one
    jobs/                     Automatic modelling runs (job.json, run-N.log)
  typologies/
    index.json                Catalogue of published typologies (one row per typology)
    <id>/                     Published typology: what house-viewer loads
      scene.json  model.glb  color-block/model.glb  render/model.glb  annotations.json
```

Rules

- `intake/` is working state; `typologies/` is the published layer. When modelling is submitted, the latest successful build is regenerated from its spec snapshot into `typologies/<project-id>/` and its row in `index.json` is added or replaced. The files are staged, verified and swapped in whole.
- Builds in `intake/` always keep the facade facing +Z (the modelling frame the LM checks). Published typologies follow `facade.side` in the spec: `back` (default) turns the model 180° so the facade faces the back yard.
- house-viewer only reads `typologies/` (via `GET /api/typologies` and `/data/typologies/<id>/…`). The built-in Fairy and Sunningdale typologies stay in `public/scenes/typology/` as bundled seed data.
- Move the whole store with `FACADE_DATA_DIR=/path/to/data`.
- To remove a photo typology: delete its folder in `typologies/` and its row in `typologies/index.json`.
