import type { HouseRepresentation } from './house-config.ts';

/** A shared house silhouette makes the three levels easy to compare. */
export function houseRepresentationIcon(mode: HouseRepresentation): string {
    const colored = mode !== 'white';
    const roof = colored ? '#58666d' : '#edf0ef';
    const wall = colored ? '#e8dfce' : '#fafbf9';
    const side = colored ? '#c5bca9' : '#dde3df';
    const details = mode === 'render' ? `
        <path d="M15 29h7v9h-7zM26 28h6v7h-6z" fill="#557b88" stroke="#fff" stroke-width="1.5"/>
        <path d="M35 29h4v7h-4z" fill="#466873"/>
        <path d="M12 37h21v3H12z" fill="#a39b88"/>
        <path d="M16 17l15 5M13 21l15 5" stroke="#829096" stroke-width=".8"/>
    ` : '';
    return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M8 40h33" stroke="#cbd4ce" stroke-width="2" stroke-linecap="round"/>
        <path d="M12 24l10-12 11 14v14H12z" fill="${wall}" stroke="#87978c" stroke-width="1.2"/>
        <path d="M33 26l8-6v16l-8 4z" fill="${side}" stroke="#87978c" stroke-width="1.2"/>
        <path d="M22 12l8-5 13 14-10 5z" fill="${roof}" stroke="#718278" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M9 25l13-15 12 16" fill="none" stroke="${colored ? '#f7f5ed' : '#9caaa0'}" stroke-width="2" stroke-linejoin="round"/>
        ${details}
    </svg>`;
}
