import type { CameraSnapshot } from '../shared/camera/types.ts';

/**
 * One AI render of a Rendering Queue capture, stored in ProjectDocument.media.renders.
 * `id` is the server's render id (GET /api/projects/<pid>/renders/<id>); one job per capture.
 */
export type RenderJob = {
    id: string;
    sourceUrl: string;
    camera?: CameraSnapshot;
    mode: 'model' | 'photo';
    /** Original photo used to match the camera and as the comparison Before. */
    basePhotoUrl?: string;
    /** Context photos sent with this render. */
    referencePhotoUrls: string[];
    status: 'queued' | 'running' | 'done' | 'failed';
    resultUrl?: string;
    error?: string;
    /** Look & atmosphere used for this render, e.g. { style: 'commercial', weather: 'clear' }. */
    options?: Record<string, string>;
};

/** Look & atmosphere chosen for the next renders (media.references, kind 'render-options'). */
export type RenderSettings = { kind: 'render-options'; values: Record<string, string> };

/** One group of prompts/options.toml as served by GET /api/render-options. */
export type RenderOptionGroup = {
    id: string;
    label: string;
    default: string;
    options: { id: string; label: string; icon?: string | null }[];
};

/** A model view in the Rendering Queue (media.references, kind 'model-capture'). */
export type CaptureRef = { kind: 'model-capture'; url: string; camera?: CameraSnapshot };
export type PhotoRenderRef = { url: string; name: string; file: string };

/** A Context photo (media.references, kind 'context'). house-photo = the photo model's original photo. */
export type ContextRef = { kind: 'context'; url: string; name: string; origin: 'upload' | 'house-photo' };

/** Which photo house last seeded Context (media.references, kind 'context-seed'). */
export type ContextSeed = { kind: 'context-seed'; typologyId: string };
