import type { ProductionRow } from '../products/parametric-engine/varenda/production-list.ts';

/** Resolve fresh instances after every successful parameter commit. */
export function reconcileSelection(rows: readonly ProductionRow[], selectedId?: string): ProductionRow | undefined {
    return rows.find((row) => row.id === selectedId);
}

export type InstanceNavigation = 'direct' | 'related' | 'parent';
export type InstanceSelection = { id: string; path: readonly string[] };

export function navigateInstance(
    current: InstanceSelection | undefined,
    id: string,
    navigation: InstanceNavigation
): InstanceSelection {
    if (navigation === 'parent' && current && current.path.length > 1) {
        const path = current.path.slice(0, -1);
        return { id: path[path.length - 1]!, path };
    }
    if (navigation === 'related' && current) {
        const existing = current.path.indexOf(id);
        const path = existing >= 0 ? current.path.slice(0, existing + 1) : [...current.path, id];
        return { id, path };
    }
    return { id, path: [id] };
}

/** Expanded menus are independent of camera focus and selection history. */
export function expandMenu(menus: Map<string, Set<string>>, rowId: string, instanceId?: string) {
    const instances = menus.get(rowId) ?? new Set<string>();
    if (instanceId) instances.add(instanceId);
    menus.set(rowId, instances);
}

export function toggleGroup(menus: Map<string, Set<string>>, rowId: string) {
    const wasOpen = menus.has(rowId);
    menus.clear();
    if (!wasOpen) menus.set(rowId, new Set());
}

/** The immediate navigation parent supplies rendering context; ancestors stay faded. */
export function selectionContext(
    current: InstanceSelection | undefined,
    groupInstanceIds: readonly string[]
): readonly string[] {
    if (!current) return [];
    const parent = current.path.at(-2);
    return parent ? [parent] : groupInstanceIds;
}
