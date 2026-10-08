# data/ — local data store

This folder stands in for a database and file store. Code never lives here, and nothing here is committed to git (except this README). The Python service (`services/facade-modeler`) is the only writer; the browser reads it through the service's HTTP API.

```text
data/
  projects/
    index.json                    Catalogue of user projects: [{ id, name, createdAt, updatedAt, house }]
    .migrated                     Written once the legacy intake/ and typologies/ were copied in
    <pid>/                        One user project (p-0001, p-0002, …)
      project.json                Project document (schemaVersion 1, revision-checked saves)
      photo-models/<mid>/         Photo intake workspace, one folder per photo model (house-001, …)
        photos/  rectified/       Original uploads and rectified elevations
        spec.json  ops.jsonl      House spec and the modelling operation log
        status.json               draft | submitted (+ the modeller's note)
        builds/v1 … vN/           Every build; builds/latest.json points at the last good one
        jobs/                     Automatic modelling runs (job.json, run-N.log)
      typologies/
        index.json                This project's published photo typologies (one row per typology)
        <mid>/                    Published typology: what house-viewer loads
          scene.json  model.glb  color-block/model.glb  render/model.glb  annotations.json  preview.png
  intake/  typologies/            Legacy (pre-projects) layout: copied into p-0001 on first start, then unused
```

Rules

- `photo-models/` is working state; `typologies/` is the published layer of the same project. When modelling is submitted, the latest successful build is regenerated from its spec snapshot into `typologies/<mid>/` and its row in `index.json` is added or replaced. The files are staged, verified and swapped in whole.
- Builds in `photo-models/` always keep the facade facing +Z (the modelling frame the LM checks). Published typologies follow `facade.side` in the spec: `back` (default) turns the model 180° so the facade faces the back yard.
- house-viewer reads a project's photo typologies via `GET /api/projects/<pid>/typologies` and `/data/projects/<pid>/typologies/<mid>/…`. The built-in Fairy and Sunningdale typologies stay in `public/scenes/typology/` as bundled seed data.
- Deleting a project (`DELETE /api/projects/<pid>`) removes its folder, including its photo models and typologies.
- Migration: on start, if `projects/.migrated` does not exist and the legacy `intake/` or `typologies/` exist, they are copied once into a new project `p-0001` ("My first project", Fairy house); the old folders are kept and never read again. Restarting does not migrate twice.
- Move the whole store with `FACADE_DATA_DIR=/path/to/data`.
