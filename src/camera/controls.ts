import type { CameraPreset } from './types.ts';
export function createCameraControls(host: HTMLElement, presets: CameraPreset[], onChange: (id: string) => void) {
    const group = document.createElement('div');
    group.className = 'view-grid';
    group.setAttribute('aria-label', 'Camera views');
    const listeners: (() => void)[] = [];
    const buttons = new Map<string, HTMLButtonElement>();
    for (const p of presets) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = p.label;
        button.dataset.view = p.id;
        const handler = () => onChange(p.id);
        button.addEventListener('click', handler);
        listeners.push(() => button.removeEventListener('click', handler));
        buttons.set(p.id, button);
        group.append(button);
    }
    host.append(group);
    return {
        update(id: string) {
            for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === id));
        },
        destroy() {
            listeners.forEach((remove) => remove());
            group.remove();
        }
    };
}
