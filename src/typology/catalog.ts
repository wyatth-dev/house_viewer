/**
 * Runtime typology catalogue: bundled presets plus the photo typologies published inside one
 * user project.
 *
 * Photo typologies are served by the Python service at /api/projects/<pid>/typologies and
 * /data/projects/<pid>/typologies/<id>/…. If the service is not running (or there is no
 * project), only the presets are listed and the page still works.
 */
import type { ProjectDocument } from '../projects/state.ts';

import { defaultTypology, parseTypology, setActiveTypology, typologies } from './index.ts';
import type { Typology, TypologyManifest, TypologySource } from './index.ts';

export type TypologyEntry = {
    id: string;
    name: string;
    source: TypologySource;
    /** User project the photo typology belongs to (photo typologies only). */
    projectId?: string;
    /** Photo model the typology was published from (photo typologies only). */
    photoModelId?: string;
    buildVersion?: number;
    baseUrl: string;
    /** Stored thumbnail, or null when it has not been rendered yet (photo typologies, until first opened). */
    previewUrl: string | null;
};

/** Index row; `projectId` is the legacy name of the photo model id (see listTypologies). */
type ApiRow = { projectId?: string; id: string; name: string; baseUrl: string; buildVersion: number; preview?: string };
type ApiReply = { ok: boolean; result: { typologies: ApiRow[] } };

/** Preset thumbnails are static files next to each preset scene.json. */
const PRESET_PREVIEW = 'preview.png';

const presetEntry = ({ id, name, baseUrl }: Typology): TypologyEntry => ({
    id,
    name,
    source: 'builtin',
    baseUrl,
    previewUrl: `${baseUrl}${PRESET_PREVIEW}`
});

const enc = encodeURIComponent;
const typologiesPath = (pid: string) => `/api/projects/${enc(pid)}/typologies`;

/** The typology does not exist (any other load failure is a different error). */
export class TypologyNotFoundError extends Error {}

/**
 * Photo typologies of project `pid`. Throws when the service cannot be reached or answers with
 * an error or an unreadable body, so a failed request is never mistaken for an empty list.
 */
async function fetchPhotoTypologies(pid: string): Promise<TypologyEntry[]> {
    const response = await fetch(typologiesPath(pid), { cache: 'no-store' });
    if (!response.ok) throw new Error(`The typology list could not be read (HTTP ${response.status})`);
    const body = (await response.json()) as ApiReply;
    if (!body?.ok || !Array.isArray(body.result?.typologies)) throw new Error('The typology list could not be read');
    return body.result.typologies
        .filter(({ id }) => !typologies.some((preset) => preset.id === id))
        .map(({ id, name, baseUrl, buildVersion, preview, projectId }) => ({
            // Legacy index format: the stored row field `projectId` holds the PHOTO MODEL id.
            // In TypologyEntry it becomes photoModelId, and projectId is the user project.
            projectId: pid,
            photoModelId: projectId,
            buildVersion,
            id,
            name,
            source: 'photo' as const,
            baseUrl,
            previewUrl: preview ? `${baseUrl}${preview}?v=${buildVersion}` : null
        }));
}

/** Presets plus the photo typologies of project `pid`; only presets when pid is null or the service is unavailable. */
export async function listTypologies(pid: string | null): Promise<TypologyEntry[]> {
    const presets = typologies.map(presetEntry);
    if (pid === null) return presets;
    try {
        return [...presets, ...(await fetchPhotoTypologies(pid))];
    } catch {
        return presets;
    }
}

/**
 * Read and validate one typology (presets are bundled; photo typologies are fetched from project `pid`).
 * Throws TypologyNotFoundError only when the typology is known not to exist: an unknown preset id
 * without a project, an id absent from a successfully read list, or a 404 for its scene.json.
 */
export async function loadTypology(id: string, pid: string | null): Promise<{ typology: Typology; entry: TypologyEntry }> {
    const preset = typologies.find((candidate) => candidate.id === id);
    if (preset) return { typology: preset, entry: presetEntry(preset) };
    if (pid === null) throw new TypologyNotFoundError(`Typology ${id} was not found`);
    const entry = (await fetchPhotoTypologies(pid)).find((candidate) => candidate.id === id);
    if (!entry) throw new TypologyNotFoundError(`Typology ${id} was not found`);
    const response = await fetch(`${entry.baseUrl}scene.json`, { cache: 'no-store' });
    if (response.status === 404) throw new TypologyNotFoundError(`Typology ${id} was not found`);
    if (!response.ok) throw new Error(`Typology ${id} could not be read (HTTP ${response.status})`);
    const typology = parseTypology((await response.json()) as TypologyManifest, entry.baseUrl, 'photo');
    return { typology: { ...typology, name: entry.name }, entry };
}

/**
 * Load the project's house and make it active. Only when the house no longer exists (for
 * example the photo model was deleted) fall back to the default preset (Fairy) and report
 * `fellBack: true`. Any other failure (service down, 5xx, unreadable reply) is thrown, so the
 * project is not opened and nothing is saved over it.
 */
export async function resolveTypology(
    house: ProjectDocument['house'],
    pid: string | null
): Promise<{ typology: Typology; entry: TypologyEntry; fellBack: boolean }> {
    try {
        const loaded = await loadTypology(house.typologyId, house.source === 'photo' ? pid : null);
        setActiveTypology(loaded.typology);
        return { ...loaded, fellBack: false };
    } catch (error) {
        if (!(error instanceof TypologyNotFoundError)) throw error;
        console.warn(`${error.message}. Showing ${defaultTypology.name}.`);
        setActiveTypology(defaultTypology);
        return { typology: defaultTypology, entry: presetEntry(defaultTypology), fellBack: true };
    }
}

/**
 * Give a freshly rendered thumbnail to the service. Preset thumbnails are static files,
 * so only photo typologies are updated. Returns the new preview URL.
 */
export async function storePreview(entry: TypologyEntry, png: Blob | undefined): Promise<string | null> {
    if (entry.source !== 'photo' || !entry.projectId || !png) return entry.previewUrl;
    const response = await fetch(`${typologiesPath(entry.projectId)}/${enc(entry.id)}/preview`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: png
    }).catch(() => undefined);
    return response?.ok ? `${entry.baseUrl}preview.png?t=${Date.now()}` : null;
}

export async function deletePhotoTypology(pid: string, id: string): Promise<void> {
    const response = await fetch(`${typologiesPath(pid)}/${enc(id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not delete this photo model. Please try again.');
}
