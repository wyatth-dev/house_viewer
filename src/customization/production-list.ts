import type { ProductionRow } from '../products/parametric-engine/varenda/production-list.ts';

import type { DisplayProductionRow } from './production-groups.ts';
import type { InstanceNavigation, InstanceSelection } from './selection-state.ts';

export function specificationLabel(row: ProductionRow): string {
    const labels: Record<string, string> = {
        lengthMm: 'L',
        widthMm: 'W',
        depthMm: 'D',
        thicknessMm: 'T',
        diameterMm: 'Ø'
    };
    return Object.entries(row.specification)
        .map(([key, value]) =>
            typeof value === 'number' ? `${labels[key] ?? key} ${Number(value.toFixed(2))} mm` : value
        )
        .join(' · ');
}
export function instanceLabel(id: string, rows: readonly ProductionRow[]): string {
    if (id.startsWith('post-column-')) return `Column ${id.slice('post-column-'.length)}`;
    if (id.endsWith('-fixed')) return 'Fixed';
    if (id.endsWith('-moving')) return 'Moving';
    const row = rows.find((part) => part.instanceIds.includes(id));
    const number = row ? row.instanceIds.indexOf(id) + 1 : '';
    if (id.includes('-screw-')) return `Screw ${number}`;
    if (id.endsWith('-bolt')) return `Bolt ${number}`;
    if (id.endsWith('-nut')) return `Nut ${number}`;
    if (id.includes('-stand-')) return `Fixing plate ${number}`;
    if (id.startsWith('rafter-')) return `Rafter ${number}`;
    if (id.startsWith('footing-')) return `Footplate ${number}`;
    if (id.includes('gasket')) return `Gasket ${number}`;
    return `${row?.label ?? 'Part'} ${number}`;
}

export function renderProductionList(
    host: HTMLElement,
    rows: readonly DisplayProductionRow[],
    selectedId: string | undefined,
    onSelect: (id: string, navigation?: InstanceNavigation) => void,
    instanceSelection?: InstanceSelection,
    onInstance: (id: string, navigation?: InstanceNavigation, menuId?: string, parentId?: string) => void = () => {
        /* Optional instance navigation. */
    },
    menus: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
    installations: ReadonlyMap<string, readonly string[]> = new Map()
) {
    const scrollY = window.scrollY;
    host.replaceChildren();
    for (const category of [...new Set(rows.map((row) => row.category))]) {
        const section = document.createElement('section');
        section.className = 'material-group';
        const heading = document.createElement('h3');
        heading.textContent = category;
        section.append(heading);
        for (const row of rows.filter((item) => item.category === category)) {
            const item = document.createElement('article');
            item.className = 'material-row';
            item.classList.toggle('selected', row.id === selectedId);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'material-select';
            button.setAttribute('aria-pressed', String(row.id === selectedId));
            button.setAttribute('aria-label', `${row.label}, quantity ${row.quantity}`);
            const image = document.createElement('span');
            image.className = 'material-placeholder';
            image.textContent = row.category === 'Fasteners' ? '⊕' : '◇';
            image.setAttribute('aria-hidden', 'true');
            const description = document.createElement('span');
            description.className = 'material-description';
            const name = document.createElement('strong');
            name.textContent = row.label;
            const material = document.createElement('span');
            material.textContent = row.material;
            const spec = document.createElement('span');
            spec.className = 'material-spec';
            spec.textContent = specificationLabel(row);
            description.append(name, material, spec);
            const quantity = document.createElement('span');
            quantity.className = 'quantity';
            quantity.textContent = String(row.quantity);
            button.append(image, description, quantity);
            button.onclick = () => onSelect(row.id);
            item.append(button);
            button.setAttribute('aria-expanded', String(menus.has(row.id)));
            if (menus.has(row.id)) {
                const detail = document.createElement('div');
                detail.className = 'row-detail';
                const note = document.createElement('p');
                note.textContent =
                    instanceSelection && row.id === selectedId
                        ? `Selected: ${instanceLabel(instanceSelection.id, rows)}`
                        : `${row.quantity} instances · select one to focus`;
                detail.append(note);
                const instances = document.createElement('div');
                const activeInstance = instanceSelection?.path[0];
                instances.className = 'instance-tags';
                for (const id of row.instanceIds) {
                    const tag = document.createElement('button');
                    tag.type = 'button';
                    const child = row.children?.find((part) => part.instanceIds.includes(id));
                    tag.textContent = child
                        ? `${id.endsWith('-fixed') ? 'Fixed' : 'Moving'} · ${specificationLabel(child)}`
                        : id.startsWith('post-column-')
                          ? `Column ${id.slice('post-column-'.length)}`
                          : instanceLabel(id, rows);
                    tag.setAttribute('aria-pressed', String(instanceSelection?.id === id));
                    tag.onclick = () => onInstance(id, 'direct', row.id);
                    instances.append(tag);
                }
                detail.append(instances);
                if (
                    activeInstance &&
                    instanceSelection &&
                    row.id === selectedId &&
                    row.instanceIds.includes(activeInstance) &&
                    menus.get(row.id)?.has(activeInstance)
                ) {
                    const parts = document.createElement('section');
                    parts.className = 'inline-screw-list';
                    parts.setAttribute('aria-label', `${instanceLabel(activeInstance, rows)} installed parts`);
                    const title = document.createElement('strong');
                    title.textContent = `${instanceLabel(activeInstance, rows)} · Installed parts`;
                    parts.append(title);
                    const ids = installations.get(activeInstance) ?? [];
                    for (const id of ids) {
                        const part = rows.find((candidate) => candidate.instanceIds.includes(id));
                        if (!part) continue;
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.textContent = `${part.label} · ${instanceLabel(id, rows)}`;
                        button.setAttribute('aria-pressed', String(instanceSelection.id === id));
                        button.onclick = () => onInstance(id, 'related', row.id, activeInstance);
                        parts.append(button);
                    }
                    if (!ids.length) {
                        const pending = document.createElement('p');
                        pending.textContent =
                            row.catalogProductId === 'varenda-footplate'
                                ? 'Screw installation data pending.'
                                : 'No installed parts recorded.';
                        parts.append(pending);
                    }
                    detail.append(parts);
                }
                item.append(detail);
            }
            section.append(item);
        }
        host.append(section);
    }
    window.scrollTo({ top: scrollY, behavior: 'instant' });
}
