/** 尺寸标注：读取 build 产出的 annotations.json，用 house-viewer 的尺寸标注组件显示（只读）。 */
import type { AppBase } from 'playcanvas';

import type { Point3, ProjectPoint } from '../../shared/geometry/types.ts';
import { createDimensionOverlay } from '../../shared/measurements/dimension-overlay.ts';

export type Annotation = {
    id: string;
    label: string;
    start: Point3;
    end: Point3;
    valueMm: number;
    group: 'overall' | 'opening';
};

export function createAnnotations(app: AppBase, host: HTMLElement) {
    const overlay = createDimensionOverlay(app, host);
    let items: Annotation[] = [];
    let showOpenings = true;
    const apply = () => overlay.update(items.filter((item) => showOpenings || item.group === 'overall'));
    return {
        set(next: Annotation[]) {
            items = next;
            apply();
        },
        setOpeningsVisible(value: boolean) {
            showOpenings = value;
            apply();
        },
        refresh(project: ProjectPoint) {
            overlay.refresh(project);
        },
        destroy() {
            overlay.destroy();
        }
    };
}
