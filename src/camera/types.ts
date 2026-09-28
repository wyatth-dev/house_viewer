import type { Bounds3, Point3, ProjectPoint, Viewport } from '../geometry/types.ts';
export type CameraPreset = {
    id: string;
    label: string;
    direction: Point3;
    projection?: 'orthographic' | 'perspective';
    fov?: number;
};
export type CameraState = { activePresetId: string };
export type CameraController = {
    setView(id: string): void;
    fit(bounds: Bounds3, viewport: Viewport): void;
    getState(): CameraState;
    project: ProjectPoint;
    onMove(listener: () => void): () => void;
    destroy(): void;
};
