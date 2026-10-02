import type { ProductionRow } from '../products/parametric-engine/varenda/production-list.ts';

export type DisplayProductionRow = ProductionRow & { children?: readonly ProductionRow[] };

/** UI assemblies preserve the catalog identities of their constituent parts. */
export function groupProductionRows(rows: readonly ProductionRow[]): DisplayProductionRow[] {
    const assemblies = [
        { id: 'gutter', label: 'Gutter' },
        { id: 'wallpiece', label: 'Wall Piece' }
    ];
    const groups = new Map<string, DisplayProductionRow>();
    const members = new Set<string>();
    for (const assembly of assemblies) {
        const children = rows.filter((row) =>
            [`varenda-${assembly.id}-fixed`, `varenda-${assembly.id}-moving`].includes(row.catalogProductId)
        );
        const first = children[0];
        if (!first) continue;
        groups.set(first.id, {
            ...first,
            id: `assembly:${assembly.id}`,
            catalogProductId: `assembly:${assembly.id}`,
            label: assembly.label,
            quantity: children.reduce((count, row) => count + row.quantity, 0),
            instanceIds: children.flatMap((row) => [...row.instanceIds]),
            children
        });
        for (const child of children) members.add(child.id);
    }
    return rows.flatMap((row) => (groups.has(row.id) ? [groups.get(row.id)!] : members.has(row.id) ? [] : [row]));
}
