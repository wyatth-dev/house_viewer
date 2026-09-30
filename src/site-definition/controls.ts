import { metresToMm, mmToMetres } from '../geometry/units.ts';

import { sides } from './layout.ts';
import type { Dimensions, DimensionErrors, Layout, SiteSide } from './types.ts';
const names: Record<SiteSide, string> = {
    front: 'Front yard',
    back: 'Back yard',
    left: 'Left clearance',
    right: 'Right clearance'
};
export function createSiteControls(
    host: HTMLElement,
    summaryHost: HTMLElement,
    initial: Dimensions,
    onChange: (value: Dimensions) => DimensionErrors
) {
    const root = document.createElement('div');
    root.className = 'dimensions';
    const drafts: Record<SiteSide, string> = {
        front: String(mmToMetres(initial.front)),
        back: String(mmToMetres(initial.back)),
        left: String(mmToMetres(initial.left)),
        right: String(mmToMetres(initial.right))
    };
    const errors = new Map<SiteSide, HTMLElement>();
    const listeners: (() => void)[] = [];
    for (const side of sides) {
        const row = document.createElement('div');
        row.className = 'dimension-field';
        row.innerHTML = `<label for="dimension-${side}">${names[side]}</label><div class="input-wrap"><input id="dimension-${side}" type="number" min="0" max="50" step="0.1" inputmode="decimal" aria-describedby="error-${side}"><span>m</span></div><span class="field-error" id="error-${side}" aria-live="polite"></span>`;
        const input = row.querySelector('input')!;
        input.value = drafts[side];
        errors.set(side, row.querySelector('.field-error')!);
        const handler = () => {
            drafts[side] = input.value;
            const value = {} as Dimensions;
            for (const key of sides) value[key] = drafts[key].trim() === '' ? NaN : metresToMm(Number(drafts[key]));
            const result = onChange(value);
            for (const key of sides) {
                errors.get(key)!.textContent = result[key] ?? '';
                root.querySelector(`#dimension-${key}`)!.setAttribute('aria-invalid', String(Boolean(result[key])));
            }
        };
        input.addEventListener('input', handler);
        listeners.push(() => input.removeEventListener('input', handler));
        root.append(row);
    }
    const summary = document.createElement('div');
    summary.className = 'property-summary';
    summary.setAttribute('aria-live', 'polite');
    summaryHost.append(summary);
    host.append(root);
    return {
        update(layout: Layout) {
            summary.innerHTML = `<span>PROPERTY SIZE</span><strong>${mmToMetres(layout.width).toFixed(1)} <small>×</small> ${mmToMetres(layout.depth).toFixed(1)} <small>m</small></strong><span>${(mmToMetres(layout.width) * mmToMetres(layout.depth)).toFixed(1)} m² total area</span>`;
        },
        destroy() {
            listeners.forEach((remove) => remove());
            root.remove();
            summary.remove();
        }
    };
}
