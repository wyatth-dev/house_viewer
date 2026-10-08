import type { TypologyEntry } from '../typology/catalog.ts';

import type { EditorState } from './editor-state.ts';
import type { ProductRecord, ProjectDocument } from './state.ts';

export const FELL_BACK = 'The selected house no longer exists; showing Fairy house.';

type House = ProjectDocument['house'];

/** Typology entry as stored in the project document. */
export function houseOf(entry: TypologyEntry): House {
    return { source: entry.source === 'photo' ? 'photo' : 'preset', typologyId: entry.id };
}

/**
 * A photo build previewed straight from its photo model (not yet published) cannot be reopened
 * from the project's typology list, so it is not stored as the project's house.
 */
export const isListed = (entry: TypologyEntry) => entry.source !== 'photo' || !entry.baseUrl.startsWith('/files/');

/** Typology ids are unique across presets and photo houses. */
const sameHouse = (a: House, b: House) => a.typologyId === b.typologyId;

/**
 * Project document after the scene switched to `entry`, or null when nothing is to be saved:
 * a not yet published build is only a temporary preview, and switching to the saved house
 * keeps its products. A different listed house is stored and its products are cleared.
 */
export function recordForSwitch(doc: ProjectDocument, entry: TypologyEntry): ProjectDocument | null {
    if (!isListed(entry)) return null;
    const house = houseOf(entry);
    if (sameHouse(house, doc.house)) return null;
    return { ...doc, house, products: [] };
}

/** The parts of the editor scene that a saved project is applied to. */
export type RestoreScene = {
    /** Apply the saved yard; false when it is invalid and the current yard was kept. */
    setDimensions(dimensionsMm: ProjectDocument['site']['dimensionsMm']): boolean;
    /** Landscape, Dimensions toggle and then the representation. */
    applyDisplay(display: ProjectDocument['display']): Promise<void>;
    restoreProducts(records: ProductRecord[]): Promise<{ skipped: number }>;
    /** Current yard and products, for the corrected record. */
    state(): { dimensionsMm: ProjectDocument['site']['dimensionsMm']; products: ProductRecord[] };
    isDisposed(): boolean;
};

/**
 * Apply saved project `doc` in order yard → display → products. The house is already active
 * (`active`: main.ts resolved it, or fell back to Fairy). Change notifications fired while
 * applying are not recorded; when the house fell back, the yard was invalid or products were
 * skipped, the corrected state is recorded once afterwards. Returns null when the scene was
 * disposed meanwhile, otherwise the notice to show (or null).
 */
export async function restoreProject(
    doc: ProjectDocument,
    active: House,
    editor: Pick<EditorState, 'beginRestore' | 'endRestore' | 'record'>,
    scene: RestoreScene
): Promise<{ notice: string | null } | null> {
    const fellBack = !sameHouse(active, doc.house);
    let skipped = 0;
    let corrected = fellBack;
    editor.beginRestore();
    try {
        if (!scene.setDimensions(doc.site.dimensionsMm)) corrected = true; // invalid saved yard: keep the defaults
        await scene.applyDisplay(doc.display);
        if (scene.isDisposed()) return null;
        // Products belong to the walls of the saved house; with the fallback house they are dropped.
        if (!fellBack && doc.products.length) {
            ({ skipped } = await scene.restoreProducts(doc.products));
            if (scene.isDisposed()) return null;
        }
    } finally {
        editor.endRestore();
    }
    const notices = [
        ...(fellBack ? [FELL_BACK] : []),
        ...(skipped > 0 ? [`${skipped} products could not be restored`] : [])
    ];
    if (notices.length) corrected = true;
    if (corrected) {
        const { dimensionsMm, products } = scene.state();
        editor.record(current => ({ ...current, house: active, site: { dimensionsMm }, products }));
    }
    return { notice: notices.length ? notices.join(' ') : null };
}

type Shown = { id: string; baseUrl: string };

/**
 * The same typology build. An unpublished build has the id of its published typology (both are
 * the photo model id), so the id alone cannot tell the preview from the saved house.
 */
export const sameTypology = (a: Shown, b: Shown) => a.id === b.id && a.baseUrl === b.baseUrl;

export type SwitchPlan = {
    /** The requested typology is already shown. */
    skip: boolean;
    /** After the switch a temporary preview build is shown; product changes on it are not saved. */
    previewing: boolean;
    /** Project document to save, or null. */
    record: ProjectDocument | null;
    /** Back on the saved house: place its saved products again. */
    replaceSaved: boolean;
};

/** What switching the scene from `active` to `entry` does to the project (`supplied`: typology already loaded). */
export function planSwitch(doc: ProjectDocument, active: Shown, entry: TypologyEntry, supplied: boolean): SwitchPlan {
    const previewing = !isListed(entry);
    const record = recordForSwitch(doc, entry);
    return {
        skip: !supplied && sameTypology(entry, active),
        previewing,
        record,
        replaceSaved: !record && !previewing && doc.products.length > 0
    };
}

/** Typology id to switch back to when photo intake closes, or null when no preview is shown. */
export const previewExit = (doc: ProjectDocument, previewing: boolean): string | null =>
    previewing ? doc.house.typologyId : null;
