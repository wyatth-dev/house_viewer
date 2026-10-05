import { Color, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { Point3, ProjectPoint } from '../geometry/types.ts';

export type DimensionAnnotation = {
    id: string;
    label: string;
    start: Point3;
    end: Point3;
    valueMm: number;
    edit?: (valueMm: number) => string | undefined;
};

/** Editable screen labels anchored to world-space dimension lines. */
export function createDimensionOverlay(app: AppBase, host: HTMLElement) {
    const entries = new Map<
        string,
        {
            data: DimensionAnnotation;
            root: HTMLDivElement;
            button: HTMLButtonElement;
            input: HTMLInputElement;
            error: HTMLSpanElement;
            editing: boolean;
        }
    >();
    let visible = true;
    let project: ProjectPoint | undefined;
    const color = new Color(0.16, 0.27, 0.22);
    const position = () => {
        if (!project) return;
        const placed: { x: number; y: number; width: number; height: number }[] = [];
        for (const entry of entries.values()) {
            const { start, end } = entry.data;
            const p = project({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: (start.z + end.z) / 2 });
            entry.root.hidden = !visible || !p.visible;
            if (entry.root.hidden) continue;
            const width = entry.root.offsetWidth;
            const height = entry.root.offsetHeight;
            const x = Math.max(width / 2, Math.min(host.clientWidth - width / 2, p.x));
            let y = Math.max(height / 2, Math.min(host.clientHeight - height / 2, p.y - 14));
            for (let attempt = 0; attempt < 12; attempt++) {
                if (
                    !placed.some(
                        (other) =>
                            Math.abs(other.x - x) < (other.width + width) / 2 + 6 &&
                            Math.abs(other.y - y) < (other.height + height) / 2 + 6
                    )
                )
                    break;
                y += height + 6;
                if (y > host.clientHeight - height / 2) {
                    y = height / 2;
                }
            }
            placed.push({ x, y, width, height });
            entry.root.style.left = `${x}px`;
            entry.root.style.top = `${y}px`;
        }
    };
    const draw = () => {
        if (!visible) return;
        for (const { data } of entries.values()) {
            const a = new Vec3(data.start.x, data.start.y, data.start.z);
            const b = new Vec3(data.end.x, data.end.y, data.end.z);
            app.drawLine(a, b, color, true);
            const dx = b.x - a.x,
                dz = b.z - a.z;
            const length = Math.hypot(dx, dz);
            if (length > 0) {
                const tick = new Vec3((-dz / length) * 120, 0, (dx / length) * 120);
                for (const point of [a, b]) app.drawLine(point.clone().sub(tick), point.clone().add(tick), color, true);
            }
        }
    };
    app.on('update', draw);
    return {
        update(annotations: readonly DimensionAnnotation[]) {
            const ids = new Set(annotations.map((data) => data.id));
            for (const [id, entry] of entries)
                if (!ids.has(id)) {
                    entry.root.remove();
                    entries.delete(id);
                }
            for (const data of annotations) {
                let entry = entries.get(data.id);
                if (!entry) {
                    const root = document.createElement('div');
                    root.className = 'measurement editable-measurement';
                    const button = document.createElement('button');
                    button.type = 'button';
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.step = '0.1';
                    input.min = '0';
                    input.hidden = true;
                    const error = document.createElement('span');
                    error.className = 'measurement-error';
                    error.setAttribute('aria-live', 'polite');
                    root.append(button, input, error);
                    host.append(root);
                    const current = { data, root, button, input, error, editing: false };
                    entry = current;
                    entries.set(data.id, current);
                    const cancel = () => {
                        current.editing = false;
                        input.hidden = true;
                        button.hidden = false;
                        error.textContent = '';
                        input.removeAttribute('aria-invalid');
                        position();
                    };
                    const commit = () => {
                        if (!current.editing) return;
                        const value = input.value.trim() === '' ? NaN : input.valueAsNumber * 1000;
                        const message = Number.isFinite(value) ? current.data.edit?.(value) : 'Enter a number.';
                        if (message) {
                            error.textContent = message;
                            input.setAttribute('aria-invalid', 'true');
                            position();
                            return;
                        }
                        cancel();
                    };
                    button.onclick = () => {
                        if (!current.data.edit) return;
                        current.editing = true;
                        input.value = String(current.data.valueMm / 1000);
                        input.hidden = false;
                        button.hidden = true;
                        input.focus();
                        input.select();
                        position();
                    };
                    input.onkeydown = (event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commit();
                            if (!current.editing) button.focus();
                        }
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            cancel();
                            button.focus();
                        }
                    };
                    input.onblur = commit;
                }
                entry.data = data;
                entry.button.textContent = `${data.label} · ${Number((data.valueMm / 1000).toFixed(3))} m`;
                entry.button.disabled = !data.edit;
                entry.button.title = data.edit
                    ? 'Click to edit · Enter to apply · Escape to cancel'
                    : 'Reference distance';
                entry.input.setAttribute('aria-label', `${data.label} in meters`);
            }
            position();
        },
        refresh(nextProject: ProjectPoint) {
            project = nextProject;
            position();
        },
        setVisible(value: boolean) {
            visible = value;
            for (const entry of entries.values()) {
                entry.editing = false;
                entry.input.hidden = true;
                entry.button.hidden = false;
                entry.error.textContent = '';
                entry.input.removeAttribute('aria-invalid');
                entry.root.hidden = !visible;
            }
            position();
        },
        destroy() {
            app.off('update', draw);
            for (const entry of entries.values()) entry.root.remove();
            entries.clear();
        }
    };
}
