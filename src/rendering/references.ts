/**
 * Pure helpers over ProjectDocument.media for the Rendering step: queue captures, Context photos
 * and AI render jobs. Every change returns a new document (autosave.update).
 */
import type { ProjectDocument } from '../projects/state.ts';

import type { CaptureRef, ContextRef, ContextSeed, RenderJob, RenderOptionGroup } from './contract.ts';

type Media = ProjectDocument['media'];
type Rec = Record<string, unknown>;

const record = (value: unknown): Rec | null => (value && typeof value === 'object' && !Array.isArray(value) ? value as Rec : null);
const withMedia = (doc: ProjectDocument, media: Partial<Media>): ProjectDocument => ({ ...doc, media: { ...doc.media, ...media } });

// ---- Queue captures ---------------------------------------------------------------------
export function captures(doc: ProjectDocument): CaptureRef[] {
    return doc.media.references.flatMap((value) => {
        const item = record(value);
        return item?.kind === 'model-capture' && typeof item.url === 'string' ? [item as CaptureRef] : [];
    });
}

export function addCapture(doc: ProjectDocument, capture: Omit<CaptureRef, 'kind'>): ProjectDocument {
    return withMedia(doc, { references: [...doc.media.references, { kind: 'model-capture', ...capture }] });
}

/** Removes the capture and its render job. */
export function removeCapture(doc: ProjectDocument, url: string): ProjectDocument {
    return withMedia(doc, {
        references: doc.media.references.filter((value) => {
            const item = record(value);
            return !(item?.kind === 'model-capture' && item.url === url);
        }),
        renders: doc.media.renders.filter(value => record(value)?.sourceUrl !== url)
    });
}

/** Older captures were stored as data: URLs; once uploaded they point at the file instead. */
export function replaceCaptureUrl(doc: ProjectDocument, from: string, to: string): ProjectDocument {
    return withMedia(doc, {
        references: doc.media.references.map((value) => {
            const item = record(value);
            return item?.kind === 'model-capture' && item.url === from ? { ...item, url: to } : value;
        }),
        renders: doc.media.renders.map((value) => {
            const item = record(value);
            return item && item.sourceUrl === from ? { ...item, sourceUrl: to } : value;
        })
    });
}

// ---- Context photos -----------------------------------------------------------------------
export function contextPhotos(doc: ProjectDocument): ContextRef[] {
    return doc.media.references.flatMap((value) => {
        const item = record(value);
        if (item?.kind !== 'context' || typeof item.url !== 'string') return [];
        return [{ kind: 'context', url: item.url, name: typeof item.name === 'string' ? item.name : '',
            origin: item.origin === 'house-photo' ? 'house-photo' : 'upload' } satisfies ContextRef];
    });
}

export function addContext(doc: ProjectDocument, items: { url: string; name: string }[]): ProjectDocument {
    const known = new Set(contextPhotos(doc).map(item => item.url));
    const added = items.filter(item => !known.has(item.url)).map(item => ({ kind: 'context', origin: 'upload', ...item }));
    return withMedia(doc, { references: [...doc.media.references, ...added] });
}

/** Only removes the photo from Context; the house model and its photo are untouched. */
export function removeContext(doc: ProjectDocument, url: string): ProjectDocument {
    return withMedia(doc, {
        references: doc.media.references.filter((value) => {
            const item = record(value);
            return !(item?.kind === 'context' && item.url === url);
        })
    });
}

function seed(doc: ProjectDocument): ContextSeed | undefined {
    for (const value of doc.media.references) {
        const item = record(value);
        if (item?.kind === 'context-seed' && typeof item.typologyId === 'string') return item as ContextSeed;
    }
    return undefined;
}

/** True when the project's photo house has not put its original photo into Context yet. */
export function needsContextSeed(doc: ProjectDocument): boolean {
    return doc.house.source === 'photo' && seed(doc)?.typologyId !== doc.house.typologyId;
}

/**
 * Puts the photo house's original photo into Context, once per house: if the user deletes it,
 * it stays deleted until they choose a different photo house (whose photo then replaces it).
 */
export function seedContext(doc: ProjectDocument, housePhoto: { url: string; name: string } | null): ProjectDocument {
    if (!needsContextSeed(doc)) return doc;
    const references = doc.media.references.filter((value) => {
        const item = record(value);
        return !(item?.kind === 'context-seed' || (item?.kind === 'context' && item.origin === 'house-photo'));
    });
    if (housePhoto && !contextPhotos(doc).some(item => item.url === housePhoto.url))
        references.push({ kind: 'context', origin: 'house-photo', ...housePhoto });
    references.push({ kind: 'context-seed', typologyId: doc.house.typologyId });
    return withMedia(doc, { references });
}

// ---- Render jobs ----------------------------------------------------------------------------
export function renderJobs(doc: ProjectDocument): RenderJob[] {
    return doc.media.renders.flatMap((value) => {
        const item = record(value);
        if (!item || typeof item.id !== 'string' || typeof item.sourceUrl !== 'string') return [];
        const known = ['queued', 'running', 'done', 'failed'];
        // Jobs from before the rendering service existed ('awaiting-integration') read as not rendered.
        const status = known.includes(item.status as string) ? item.status as RenderJob['status'] : 'failed';
        return [{ ...(item as RenderJob), status, referencePhotoUrls: Array.isArray(item.referencePhotoUrls) ? item.referencePhotoUrls as string[] : [] }];
    });
}

export function jobFor(doc: ProjectDocument, sourceUrl: string): RenderJob | undefined {
    return renderJobs(doc).find(job => job.sourceUrl === sourceUrl);
}

export function photoJobFor(doc: ProjectDocument, photoUrl: string): RenderJob | undefined {
    return renderJobs(doc).find(job => job.mode === 'photo' && job.basePhotoUrl === photoUrl);
}

export function comparisonSource(job: RenderJob): string {
    return job.mode === 'photo' && job.basePhotoUrl ? job.basePhotoUrl : job.sourceUrl;
}

/** One job per capture: a new render replaces the previous one. */
export function storeJob(doc: ProjectDocument, job: RenderJob): ProjectDocument {
    return withMedia(doc, {
        renders: [...doc.media.renders.filter((value) => {
            const item = record(value);
            return !(item && (item.sourceUrl === job.sourceUrl || item.id === job.id ||
                (job.mode === 'photo' && job.basePhotoUrl && item.mode === 'photo' && item.basePhotoUrl === job.basePhotoUrl)));
        }), job]
    });
}

// ---- Look & atmosphere ----------------------------------------------------------------------
function storedSettings(doc: ProjectDocument): Record<string, string> {
    for (const value of doc.media.references) {
        const item = record(value);
        const values = record(item?.values);
        if (item?.kind === 'render-options' && values)
            return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    }
    return {};
}

/** The project's choice per group; groups never chosen (or whose option was removed) use the default. */
export function renderSettings(doc: ProjectDocument, groups: RenderOptionGroup[]): Record<string, string> {
    const stored = storedSettings(doc);
    return Object.fromEntries(groups.map((group) => {
        const value = stored[group.id];
        return [group.id, group.options.some(option => option.id === value) ? value : group.default];
    }));
}

export function setRenderSetting(doc: ProjectDocument, group: string, value: string): ProjectDocument {
    const values = { ...storedSettings(doc), [group]: value };
    return withMedia(doc, {
        references: [...doc.media.references.filter(item => record(item)?.kind !== 'render-options'), { kind: 'render-options', values }]
    });
}

/** Puts a render's recorded choices back into the panel (only groups that still exist). */
export function applyRenderSettings(doc: ProjectDocument, groups: RenderOptionGroup[], values: Record<string, string> | undefined): ProjectDocument {
    if (!values) return doc;
    let next = doc;
    for (const group of groups) {
        const value = values[group.id];
        if (value && group.options.some(option => option.id === value)) next = setRenderSetting(next, group.id, value);
    }
    return next;
}
