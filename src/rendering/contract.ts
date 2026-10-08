import type { CameraSnapshot } from '../shared/camera/types.ts';

/** Persist these records in ProjectDocument.media.renders. URLs must survive reopening. */
export type RenderJob = {
    id: string;
    sourceUrl: string;
    camera?: CameraSnapshot;
    mode: 'model' | 'photo-overlay';
    basePhotoUrl?: string;
    referencePhotoUrls: string[];
    status: 'awaiting-integration' | 'queued' | 'running' | 'done' | 'failed';
    resultUrl?: string;
    error?: string;
};
export type RenderRequest = { projectId: string; job: RenderJob };
export type RenderResult = { resultUrl: string };
/** Claude: replace with service submission/polling. Do not fabricate a rendered image. */
export async function generateRender(_request: RenderRequest): Promise<RenderResult> {
    throw new Error('Rendering service is not connected yet.');
}
