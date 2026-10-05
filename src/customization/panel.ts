import type { DisplayProductionRow } from './production-groups.ts';
import { renderProductionList } from './production-list.ts';
import type { InstanceNavigation, InstanceSelection } from './selection-state.ts';

export function createCustomizationPanel(
    host: HTMLElement,
    onSelect: (id: string, navigation?: InstanceNavigation) => void,
    onOverview: () => void,
    onInstance: (id: string, navigation?: InstanceNavigation, menuId?: string, parentId?: string) => void
) {
    host.innerHTML = `<nav class="product-tabs" aria-label="Product steps"><button type="button" id="customization-tab" aria-pressed="true">01 Customization</button><button type="button" id="production-tab" aria-pressed="false">02 Production list</button></nav>
    <section id="parameter-panel"><div class="section-heading"><div><span class="eyebrow">CUSTOMIZATION</span><h1>Shape your veranda.</h1><p>Set the dimensions. See every component take its place.</p></div><span class="unit-label">DIMENSIONS IN MM</span></div><fieldset id="parameter-fields" disabled><div class="parameter-grid">
    <label>Width<input id="product-width" type="number" step="100"></label><label>Depth<input id="product-depth" type="number" step="100"></label><label>Post spacing<input id="post-interval" type="number" step="100"></label><label>Underside height<input id="underside-height" type="number" step="100"></label><label>Wall height<input id="wall-height" type="number" step="100"></label></div></fieldset></section>
    <section id="production-panel" hidden><div class="section-heading"><div><span class="eyebrow">PRODUCTION LIST</span><h1>Every part, accounted for.</h1><p>Select a row to highlight and frame its components.</p></div><button type="button" class="secondary-button" id="clear-selection">Show all parts</button></div><div class="list-summary" id="list-summary"></div><div id="materials-list"></div><p class="list-note">MVP preview · unconfirmed materials and specifications are marked pending. Additional fixing schedules are not yet defined. Fasteners are shown as hole-axis lines.</p></section>`;
    const customize = host.querySelector<HTMLButtonElement>('#customization-tab')!,
        production = host.querySelector<HTMLButtonElement>('#production-tab')!;
    const setTab = (list: boolean) => {
        document.querySelector<HTMLElement>('.product-page')!.classList.toggle('production-mode', list);
        host.querySelector<HTMLElement>('#parameter-panel')!.hidden = list;
        host.querySelector<HTMLElement>('#production-panel')!.hidden = !list;
        customize.setAttribute('aria-pressed', String(!list));
        production.setAttribute('aria-pressed', String(list));
    };
    customize.onclick = () => {
        setTab(false);
        onOverview();
    };
    production.onclick = () => setTab(true);
    host.querySelector<HTMLButtonElement>('#clear-selection')!.onclick = onOverview;
    return {
        update(
            rows: readonly DisplayProductionRow[],
            selectedId?: string,
            instanceSelection?: InstanceSelection,
            menus?: ReadonlyMap<string, ReadonlySet<string>>,
            installations?: ReadonlyMap<string, readonly string[]>
        ) {
            renderProductionList(
                host.querySelector<HTMLElement>('#materials-list')!,
                rows,
                selectedId,
                onSelect,
                instanceSelection,
                onInstance,
                menus,
                installations
            );
            host.querySelector<HTMLElement>('#list-summary')!.textContent =
                `${rows.reduce((n, row) => n + (row.children?.length ?? 1), 0)} specifications · ${rows.reduce((n, row) => n + row.quantity, 0)} parts`;
        },
        enable() {
            host.querySelector<HTMLFieldSetElement>('#parameter-fields')!.disabled = false;
        },
        destroy() {
            host.replaceChildren();
        }
    };
}
