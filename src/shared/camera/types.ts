import type { Bounds3, Point3, ProjectPoint, Viewport } from '../geometry/types.ts';
export type CameraPreset = {
    id: string;
    label: string;
    direction: Point3;
    projection?: 'orthographic' | 'perspective';
    fov?: number;
};
export type CameraBasis = { right: Point3; up: Point3; front: Point3 };
export type CameraState = { activePresetId: string };
export type CameraController = {
    setView(id: string): void;
    fit(bounds: Bounds3, viewport: Viewport, animate?: boolean, basis?: CameraBasis, preserveView?: boolean): void;
    orbit(yawDelta: number, pitchDelta: number): void;
    zoom(factor: number): void;
    getState(): CameraState;
    project: ProjectPoint;
    screenToGround(x: number, y: number, groundYMm?: number): Point3 | undefined;
    onMove(listener: () => void): () => void;
    destroy(): void;
};
