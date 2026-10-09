import type { RenderOptionGroup } from './contract.ts';

const stroke = (d: string) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Icons named by `icon` in prompts/options.toml. Unknown names show no icon. */
export const OPTION_ICONS: Record<string, string> = {
    sparkle: stroke('M12 3.5l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'),
    camera: stroke('M4 7h3.5l1.8-2.5h5.4L16.5 7H20v12H4z') + '<circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    brush: stroke('M15 4.5l4.5 4.5-7.5 7.5-4.5-4.5zM7.5 12l-1.2 1.2A3 3 0 0 0 5 15.5c0 1.8-1 3-2 3.5 2.6.6 6.4.4 7.4-2.8l.6-.7'),
    sun: '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/>' + stroke('M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4'),
    sunset: stroke('M3 17.5h18M6.5 17.5a5.5 5.5 0 0 1 11 0M12 5v3M4.6 10.1l1.6 1.2M19.4 10.1l-1.6 1.2M8 21h8'),
    moon: stroke('M19.5 14.5A7.8 7.8 0 1 1 9.5 4.5a6.2 6.2 0 0 0 10 10z'),
    cloud: stroke('M7 18.5h10.5a4 4 0 0 0 .3-8A6 6 0 0 0 6.2 11.6 3.5 3.5 0 0 0 7 18.5z'),
    rain: stroke('M7 14.5h10.5a4 4 0 0 0 .3-8A6 6 0 0 0 6.2 7.6 3.5 3.5 0 0 0 7 14.5zM8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5'),
    flower: '<circle cx="12" cy="9" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/>' + stroke('M12 6.8a2.6 2.6 0 1 1 3.2 2.2 2.6 2.6 0 1 1-1.2 3.7M12 6.8a2.6 2.6 0 1 0-3.2 2.2 2.6 2.6 0 1 0 1.2 3.7M12 11.2V21M12 17c-1.8-1.8-3.8-2-5-1.6M12 18.5c1.6-1.4 3.4-1.6 4.6-1.2'),
    leaf: stroke('M5 19C5 10.5 10.5 5 20 4c-.6 9.5-6 15-15 15zM5 19l8.5-8.5'),
    maple: stroke('M12 3l1.7 3.6 3.6-1-1 3.8 3.2 1.8-3.4 1.8.9 3.6-4.2-1.4h-1.6L7 16.6l.9-3.6-3.4-1.8 3.2-1.8-1-3.8 3.6 1zM12 15v6'),
    snow: stroke('M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2L3.8 16.8M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2')
};

export const iconSvg = (name?: string | null, size = 18) => {
    const body = name ? OPTION_ICONS[name] : undefined;
    return body ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${body}</svg>` : '';
};

/** Short "Commercial · Day · Clear · Summer" line for a set of choices. */
export function describeOptions(groups: RenderOptionGroup[], values: Record<string, string> | undefined) {
    if (!values) return [];
    return groups.flatMap((group) => {
        const option = group.options.find(item => item.id === values[group.id]);
        return option ? [{ group: group.label, label: option.label, icon: option.icon }] : [];
    });
}

/**
 * "Look & atmosphere": one row of choices per option group. The first group (style) shows as
 * large tiles, the others as pills. `onChange` receives (group id, option id).
 */
export function renderOptionsPanel(host: HTMLElement, groups: RenderOptionGroup[], values: Record<string, string>,
    onChange: (group: string, option: string) => void) {
    host.hidden = groups.length === 0;
    const header = document.createElement('div');
    header.className = 'render-options-header';
    header.innerHTML = '<h2>Look &amp; atmosphere</h2>';
    const summary = document.createElement('p');
    summary.className = 'render-options-summary';
    summary.textContent = describeOptions(groups, values).map(item => item.label).join(' · ');
    header.append(summary);

    const rows = groups.map((group, index) => {
        const row = document.createElement('div');
        row.className = `render-option-group${index === 0 ? ' tiles' : ''}`;
        row.setAttribute('role', 'radiogroup');
        const label = document.createElement('span');
        label.className = 'render-option-label';
        label.id = `render-option-${group.id}`;
        label.textContent = group.label;
        row.setAttribute('aria-labelledby', label.id);
        const choices = document.createElement('div');
        choices.className = 'render-option-choices';
        const buttons = group.options.map((option) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'render-option';
            button.setAttribute('role', 'radio');
            const checked = values[group.id] === option.id;
            button.setAttribute('aria-checked', String(checked));
            button.tabIndex = checked ? 0 : -1;
            button.innerHTML = `${iconSvg(option.icon, index === 0 ? 22 : 16)}<span></span>`;
            button.querySelector('span')!.textContent = option.label;
            button.onclick = () => { if (!checked) onChange(group.id, option.id); };
            return button;
        });
        // Arrow keys move within a group (radio group pattern).
        choices.addEventListener('keydown', (event) => {
            const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const current = buttons.findIndex(button => button === document.activeElement);
            const next = group.options[(current + step + buttons.length) % buttons.length];
            onChange(group.id, next.id);
            requestAnimationFrame(() => host.querySelector<HTMLButtonElement>(`#render-option-${group.id} + .render-option-choices [aria-checked="true"]`)?.focus());
        });
        choices.append(...buttons);
        row.append(label, choices);
        return row;
    });
    host.replaceChildren(header, ...rows);
}
