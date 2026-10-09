/** Python service endpoints for project media and AI renders (services/facade-modeler). */
import type { RenderOptionGroup } from './contract.ts';

const enc = encodeURIComponent;

type Reply<T> = { ok?: boolean; result?: T & { error?: string }; detail?: unknown };

async function call<T>(input: string, init?: RequestInit): Promise<T> {
    const response = await fetch(input, init);
    const body = (await response.json().catch(() => ({}))) as Reply<T>;
    if (!response.ok || body.ok === false || !body.result) {
        const detail = typeof body.detail === 'string' ? body.detail : undefined;
        throw new Error(body.result?.error ?? detail ?? `Request failed (HTTP ${response.status})`);
    }
    return body.result;
}

export type MediaFile = { path: string; url: string; name: string };
export type RenderState = {
    id: string;
    state: 'queued' | 'running' | 'done' | 'failed';
    resultUrl: string | null;
    error: string | null;
    options?: Record<string, string>;
};

export async function uploadMedia(pid: string, kind: 'captures' | 'context', files: Blob[]): Promise<MediaFile[]> {
    const form = new FormData();
    for (const file of files) form.append('files', file, file instanceof File ? file.name : 'capture.jpg');
    return (await call<{ files: MediaFile[] }>(`/api/projects/${enc(pid)}/media/${kind}`, { method: 'POST', body: form })).files;
}

/** Deletes an uploaded capture or Context photo. Other URLs (house photos) are ignored. */
export async function deleteMedia(pid: string, url: string): Promise<void> {
    const prefix = `/data/projects/${pid}/media/`;
    if (!url.startsWith(prefix)) return;
    await call<unknown>(`/api/projects/${enc(pid)}/media/${url.slice(prefix.length)}`, { method: 'DELETE' });
}

export async function startRender(pid: string, sourceUrl: string, contextUrls: string[], options: Record<string, string>): Promise<RenderState> {
    return (await call<{ render: RenderState }>(`/api/projects/${enc(pid)}/renders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceUrl, contextUrls, options })
    })).render;
}

/** Look & atmosphere groups from prompts/options.toml (style, time of day, weather, season, …). */
export async function getRenderOptions(): Promise<RenderOptionGroup[]> {
    return (await call<{ groups: RenderOptionGroup[] }>('/api/render-options')).groups;
}

export async function getRender(pid: string, id: string): Promise<RenderState> {
    return (await call<{ render: RenderState }>(`/api/projects/${enc(pid)}/renders/${enc(id)}`)).render;
}
