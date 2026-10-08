/**
 * Runtime typology catalogue: bundled presets plus typologies published by photo intake.
 *
 * Photo typologies live in the data store (data/typologies) and are served by the Python
 * service at /api/typologies and /data/typologies/<id>/…. If the service is not running,
 * only the presets are listed and the page still works.
 */
import { defaultTypology, parseTypology, setActiveTypology, typologies } from './index.ts';
import type { Typology, TypologyManifest, TypologySource } from './index.ts';

export type TypologyEntry = {
    id: string;
    name: string;
    source: TypologySource;
    baseUrl: string;
    /** Stored thumbnail, or null when it has not been rendered yet (photo typologies, until first opened). */
    previewUrl: string | null;
};

export const TYPOLOGY_PARAM = 'typology';

type ApiRow = { id: string; name: string; baseUrl: string; buildVersion: number; preview?: string };
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

export async function listTypologies(): Promise<TypologyEntry[]> {
    const presets = typologies.map(presetEntry);
    try {
        const response = await fetch('/api/typologies', { cache: 'no-store' });
        if (!response.ok) return presets;
        const body = (await response.json()) as ApiReply;
        const photos = body.ok ? body.result.typologies : [];
        return [
            ...presets,
            ...photos
                .filter(({ id }) => !presets.some((preset) => preset.id === id))
                .map(({ id, name, baseUrl, buildVersion, preview }) => ({
                    id,
                    name,
                    source: 'photo' as const,
                    baseUrl,
                    previewUrl: preview ? `${baseUrl}${preview}?v=${buildVersion}` : null
                }))
        ];
    } catch {
        return presets;
    }
}

/** Page URL that opens the viewer on one typology. */
export const typologyUrl = (id: string) => `/?${TYPOLOGY_PARAM}=${encodeURIComponent(id)}`;

/** Read and validate one typology (presets are bundled; photo typologies are fetched). */
export async function loadTypology(id: string): Promise<{ typology: Typology; entry: TypologyEntry }> {
    const preset = typologies.find((candidate) => candidate.id === id);
    if (preset) return { typology: preset, entry: presetEntry(preset) };
    const entry = (await listTypologies()).find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Typology ${id} was not found`);
    const response = await fetch(`${entry.baseUrl}scene.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Typology ${id} could not be read (${response.status})`);
    const typology = parseTypology((await response.json()) as TypologyManifest, entry.baseUrl, 'photo');
    return { typology: { ...typology, name: entry.name }, entry };
}

/**
 * Pick the typology named in ?typology=… (default otherwise) and make it active.
 * Returns a warning when the requested typology could not be loaded.
 */
export async function resolveActiveTypology(
    search = window.location.search
): Promise<{ typology: Typology; entry: TypologyEntry; warning?: string }> {
    const requested = new URLSearchParams(search).get(TYPOLOGY_PARAM);
    try {
        const loaded = await loadTypology(requested ?? defaultTypology.id);
        setActiveTypology(loaded.typology);
        return loaded;
    } catch (error) {
        setActiveTypology(defaultTypology);
        return {
            typology: defaultTypology,
            entry: presetEntry(defaultTypology),
            warning: `${(error as Error).message}. Showing ${defaultTypology.name}.`
        };
    }
}

/**
 * Give a freshly rendered thumbnail to the service. Preset thumbnails are static files,
 * so only photo typologies without a stored one are sent. Returns the new preview URL.
 */
export async function storePreview(entry: TypologyEntry, png: Blob | undefined): Promise<string | null> {
    if (entry.source !== 'photo' || entry.previewUrl || !png) return entry.previewUrl;
    const response = await fetch(`/api/typologies/${encodeURIComponent(entry.id)}/preview`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: png
    }).catch(() => undefined);
    return response?.ok ? `${entry.baseUrl}preview.png?t=${Date.now()}` : null;
}
