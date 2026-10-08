import { parseProject  } from './state.ts';
import type { ProjectDocument } from './state.ts';

export type ProjectRow = {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    house: ProjectDocument['house'];
};

export class ConflictError extends Error {
    current: ProjectDocument;
    constructor(current: ProjectDocument) {
        super('Project was modified elsewhere');
        this.name = 'ConflictError';
        this.current = current;
    }
}

type Json = Record<string, unknown>;

function detailText(detail: unknown): string | null {
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        const parts = detail.map((d) => {
            if (typeof d === 'string') return d;
            if (d && typeof d === 'object') {
                const { loc, msg } = d as { loc?: unknown; msg?: unknown };
                const where = Array.isArray(loc) ? loc.filter((x) => x !== 'body').join('.') : '';
                return where ? `${where}: ${String(msg)}` : String(msg);
            }
            return String(d);
        });
        return parts.join('; ');
    }
    return null;
}

function errorMessage(status: number, body: Json | null): string {
    const result = body?.result as Json | undefined;
    const fromEnvelope = typeof result?.error === 'string' ? result.error : null;
    const fromIssues = Array.isArray(body?.issues) && body.issues.length ? detailText(body.issues) : null;
    return fromEnvelope ?? detailText(body?.detail) ?? fromIssues ?? `Request failed (HTTP ${status})`;
}

async function request(url: string, init?: RequestInit): Promise<{ status: number; body: Json | null }> {
    const response = await fetch(url, init);
    let body: Json | null = null;
    try {
        body = (await response.json()) as Json;
    } catch {
        body = null;
    }
    return { status: response.status, body };
}

function ensureOk({ status, body }: { status: number; body: Json | null }): Json {
    if (status < 200 || status >= 300 || !body || body.ok === false) throw new Error(errorMessage(status, body));
    return (body.result ?? {}) as Json;
}

const base = '/api/projects';
const jsonHeaders = { 'Content-Type': 'application/json' };

export async function listProjects(): Promise<ProjectRow[]> {
    const result = ensureOk(await request(base));
    return (result.projects ?? []) as ProjectRow[];
}

export async function createProject(name?: string): Promise<ProjectDocument> {
    const result = ensureOk(await request(base, {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify(name === undefined ? {} : { name })
    }));
    return parseProject(result);
}

export async function getProject(pid: string): Promise<ProjectDocument> {
    return parseProject(ensureOk(await request(`${base}/${encodeURIComponent(pid)}`)));
}

export async function saveProject(doc: ProjectDocument, keepalive = false): Promise<ProjectDocument> {
    const res = await request(`${base}/${encodeURIComponent(doc.id)}`, {
        method: 'PUT', headers: jsonHeaders, body: JSON.stringify(doc), keepalive
    });
    if (res.status === 409) {
        const current = (res.body?.result as Json | undefined)?.current;
        if (current) throw new ConflictError(parseProject(current));
    }
    return parseProject(ensureOk(res));
}

export async function renameProject(pid: string, name: string): Promise<ProjectDocument> {
    return parseProject(ensureOk(await request(`${base}/${encodeURIComponent(pid)}/name`, {
        method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ name })
    })));
}

export async function deleteProject(pid: string): Promise<void> {
    ensureOk(await request(`${base}/${encodeURIComponent(pid)}`, { method: 'DELETE' }));
}
