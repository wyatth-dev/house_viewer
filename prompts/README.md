# AI rendering prompts

Plain text, edit freely. Everything here is read again for every render (no restart needed).

- `render.txt` — the main prompt. `{details}` marks where the details paragraph goes.
- `render-context.txt` — the details paragraph when the project has Context photos.
- `render-no-context.txt` — the details paragraph when it has none (optional).

Rule for `render.txt`: the render is laid over the model capture in a Before / After slider, so **both camera perspective and built structures come first**. The current 9 October revision places surface appearance and reference-photo instructions before a final geometry block. The capture is the sole source for viewpoint and projected geometry; the final block locks roof edges, walls, openings and every veranda component to their image coordinates. Context photos supply material appearance only and cannot override geometry. Blank background and model ground-plane edges are placeholders: the prompt completes them as continuous ground, garden boundaries, planting and sky. The geometry lock applies to the house and veranda, not the temporary model base.

`{details}` is explicitly placed before the final constraints, so reference instructions cannot be appended after them. All four Look & atmosphere groups are active: `{style}`, `{time_of_day}`, `{weather}`, and `{season}`. Their wording limits changes to surface appearance, illumination, sky, lawn and background plants. Golden hour uses warm amber illumination wording instead of asking for a new late-afternoon scene. Seasons do not change the house or veranda; winter uses a light frost rather than thick snow.

The 9 October atmosphere stage ran 12 real API probes on the same capture with the full reference photo, including individual weather/season choices and two combinations. The final warm-light wording and tested combinations stayed much closer to the capture than the failing v3 case. A spring trial drifted and its unchanged repeat was closer; the superseded late-afternoon wording also drifted. These are **limited trials, not a guarantee of pixel-perfect geometry or reliability across houses and camera views**. Illustration remained subtle. Prompts, raw outputs, settings and approximate edge-registration measurements are retained in `data/render-prompt-tests/2026-10-09-atmosphere/`. Earlier geometry and scene-completion trials are in `data/render-prompt-tests/2026-10-09-terminal-geometry/`; see the Celuplast log's latest alignment-test follow-up.

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
