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
export type FacadeSide = 'back' | 'front';
export type PhotoInfo = { id: string; file: string; primary: boolean; rectified: string | null };
export type ProjectSummary = {
    id: string;
    /** 照片拍的是哪一面：back 时发布后立面朝向后院（house-viewer 的 Back）。 */
    facadeSide: FacadeSide;
    photos: PhotoInfo[];
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
    const body = (await response.json()) as Reply<T> & { detail?: string };
    if (!response.ok || !body.ok) throw new Error(body.result?.error ?? body.detail ?? `Request failed (${response.status})`);
    return body.result;
}

export const fileUrl = (projectId: string, path: string) => `/files/${projectId}/${path}`;

export async function listProjects(): Promise<string[]> {
    return (await call<{ projects: string[] }>('/api/projects')).projects;
}

export function getProject(id: string): Promise<ProjectSummary> {
    return call<ProjectSummary>(`/api/projects/${id}`);
}

/** 上传照片；projectId 为空时新建项目。宽度留空表示跳过（由 LM 估计）。 */
export async function upload(files: File[], widthMm: number | null, projectId: string | null, facadeSide: FacadeSide): Promise<string> {
    const form = new FormData();
    form.append('facadeSide', facadeSide);
    for (const file of files) form.append('files', file);
    if (widthMm !== null) form.append('widthMm', String(widthMm));
    if (projectId) form.append('projectId', projectId);
    return (await call<{ projectId: string }>('/api/uploads', { method: 'POST', body: form })).projectId;
}

/** 自动建模失败后重新运行（查看页的 Run again 按钮）。 */
export async function runAgain(projectId: string): Promise<void> {
    await call<unknown>(`/api/projects/${projectId}/run`, { method: 'POST' });
}

/** 把最新 build 发布为 typology（提交时会自动发布；这是手动补救）。 */
export async function publish(projectId: string): Promise<void> {
    await call<unknown>(`/api/projects/${projectId}/publish`, { method: 'POST' });
}
