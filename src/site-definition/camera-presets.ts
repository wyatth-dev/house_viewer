import type { CameraPreset } from '../shared/camera/index.ts';
const elevation = Math.tan((40 * Math.PI) / 180);
const yaw = (20 * Math.PI) / 180;
export const cameraPresets: CameraPreset[] = [
    {
        id: 'front',
        label: 'Front',
        projection: 'perspective',
        fov: 45,
        direction: { x: Math.sin(yaw), y: elevation, z: Math.cos(yaw) }
    },
    {
        id: 'back',
        label: 'Back',
        projection: 'perspective',
        fov: 45,
        direction: { x: -Math.sin(yaw), y: elevation, z: -Math.cos(yaw) }
    },
    { id: 'left', label: 'Left', direction: { x: -1, y: elevation, z: 0 } },
    { id: 'right', label: 'Right', direction: { x: 1, y: elevation, z: 0 } }
];
