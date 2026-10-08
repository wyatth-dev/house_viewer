import type { CameraPreset } from '../../shared/camera/index.ts';

/** 立面朝 +Z。正视（正交）、正前（透视）、左前斜视（透视）。 */
const tilt = (degrees: number) => Math.tan((degrees * Math.PI) / 180);
const yaw = (35 * Math.PI) / 180;
export const cameraPresets: CameraPreset[] = [
    { id: 'oblique', label: 'Oblique', projection: 'perspective', fov: 40, direction: { x: -Math.sin(yaw), y: tilt(18), z: Math.cos(yaw) } },
    { id: 'front', label: 'Front', projection: 'perspective', fov: 40, direction: { x: 0, y: tilt(8), z: 1 } },
    { id: 'elevation', label: 'Elevation', direction: { x: 0, y: 0, z: 1 } }
];
