/** Python 服务（services/facade-modeler，facade-modeler-http）的接口。 */
export type WidthState = { widthMm: number | null; source: string | null; skipped: boolean };
export type Issue = { code: string; message: string; ids: string[] };
export type JobState = {
    state: 'queued' | 'running' | 'done' | 'failed';
    run: number;
    startedAt?: string | null;
    finishedAt?: string | null;
    error?: string | null;
    logTail?: string;
    rerunPending?: boolean;
};
export type FacadeSide = 'back' | 'front' | 'left' | 'right';
export type PhotoInfo = { id: string; file: string; primary: boolean; rectified: string | null };
/** One photo model inside a user project (GET /api/projects/<pid>/photo-models/<mid>). */
export type PhotoModelSummary = {
    id: string;
    name?: string;
    /** 照片拍的是哪一面：back 时发布后立面朝向后院（house-viewer 的 Back）。 */
    facadeSide: FacadeSide;
    photos: PhotoInfo[];
    wallWidths?: Partial<Record<FacadeSide, number | null>>;
    facadePhotos?: Partial<Record<FacadeSide, PhotoInfo[]>>;
    width: WidthState;
    latestBuild: number | null;
    buildDir: string | null;
    status: { state: 'draft' | 'submitted'; note: string };
    issues: Issue[];
    job: JobState | null;
    lastStep: { tool: string; time: string } | null;
    /** 已发布的 typology（提交后自动发布）；未发布为 null。 */
    typology: { id: string; name: string; buildVersion: number } | null;
};
type Reply<T> = { ok: boolean; result: T & { error?: string } };

async function call<T>(input: string, init?: RequestInit): Promise<T> {
    const response = await fetch(input, init);
    // Errors arrive either as the envelope {ok:false,result:{error}} or as FastAPI's {detail}.
    const body = (await response.json().catch(() => ({}))) as Partial<Reply<T>> & { detail?: string };
    if (!response.ok || !body.ok) throw new Error(body.result?.error ?? body.detail ?? `Request failed (${response.status})`);
    return body.result!;
}

const enc = encodeURIComponent;
const modelPath = (pid: string, mid: string) => `/api/projects/${enc(pid)}/photo-models/${enc(mid)}`;

/** A file inside one photo model (photos, rectified views, builds). */
export const fileUrl = (pid: string, mid: string, path: string) => `/files/${enc(pid)}/${enc(mid)}/${path}`;

/** Ids of the photo models in a user project. (The server keeps the result key `projects`.) */
export async function listPhotoModels(pid: string): Promise<string[]> {
    return (await call<{ projects: string[] }>(`/api/projects/${enc(pid)}/photo-models`)).projects;
}

export function getPhotoModel(pid: string, mid: string): Promise<PhotoModelSummary> {
    return call<PhotoModelSummary>(modelPath(pid, mid));
}

/** 上传照片；mid 为空时在项目里新建照片模型。宽度留空表示跳过（由 LM 估计）。返回照片模型 id。 */
export async function uploadPhotos(pid: string, files: File[], widthMm: number | null, mid: string | null, facadeSide: FacadeSide, name?: string): Promise<string> {
    const form = new FormData();
    form.append('facadeSide', facadeSide);
    if (name?.trim()) form.append('name', name.trim());
    for (const file of files) form.append('files', file);
    if (widthMm !== null) form.append('widthMm', String(widthMm));
    if (mid) form.append('projectId', mid); // the form field keeps its old name; it holds the photo model id
    return (await call<{ photoModelId: string }>(`/api/projects/${enc(pid)}/photo-models`, { method: 'POST', body: form })).photoModelId;
}

/** 自动建模失败后重新运行（查看页的 Run again 按钮）。 */
export async function runAgain(pid: string, mid: string, widthMm?: number | null): Promise<void> {
    await call<unknown>(`${modelPath(pid, mid)}/run`, { method: 'POST',
        ...(widthMm === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ widthMm }) })
    });
}

/** 把最新 build 发布为 typology（提交时会自动发布；这是手动补救）。 */
export async function publish(pid: string, mid: string): Promise<void> {
    await call<unknown>(`${modelPath(pid, mid)}/publish`, { method: 'POST' });
}

export async function renamePhotoModel(pid: string, mid: string, name: string): Promise<string> {
    return (await call<{ name: string }>(`${modelPath(pid, mid)}/name`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    })).name;
}
