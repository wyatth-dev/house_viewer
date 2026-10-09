# AI rendering prompts

Plain text, edit freely. Everything here is read again for every render (no restart needed).

- `render.txt` — the main prompt. `{details}` marks where the details paragraph goes.
- `render-context.txt` — the details paragraph when the project has Context photos.
- `render-no-context.txt` — the details paragraph when it has none (optional).

Order in `render.txt`, on purpose: the priority rule first, style in the middle, details next, and the camera/geometry constraints last. Models weigh the start and the end of a prompt most and the middle least, so the most important rule (keep the model view) is stated at both ends and the least important (style) sits in the middle. The layout follows OpenAI's image prompting guide: scene, details, then constraints.
- `options.toml` — the **Look & atmosphere** buttons in the Rendering panel. One group per parameter (`style`, `time_of_day`, `weather`, `season`); each option has a button `label`, an optional `icon` and the `text` that goes into the prompt. The group's `default` is used until the user picks something (default style: `commercial`).

Parameters (filled in by the service):

| Parameter | Becomes |
|---|---|
| `{capture}` | the model capture from the Rendering Queue, e.g. `Image 1` |
| `{context}` | the Context photos, e.g. `Image 2` or `Images 2 to 4` |
| `{context_count}` | number of Context photos |
| `{details}` | `render-context.txt` or `render-no-context.txt` |
| `{style}`, `{time_of_day}`, `{weather}`, `{season}` | the `text` of the chosen option in `options.toml` |

To add a new kind of choice (for example `mood`): add a `[mood]` group with options to `options.toml` and write `{mood}` in `render.txt`. The panel shows it automatically; icons available: sparkle, camera, brush, sun, sunset, moon, cloud, rain, flower, leaf, maple, snow (`src/rendering/options-panel.ts`).

The prompt actually sent for each render, and the options used, are saved in `data/projects/<pid>/media/renders/<rid>/` (`prompt.txt`, `job.json`).
