import { TONEMAP_ACES } from 'playcanvas';

export const daylightConfig = {
    camera: { minimumFarClip: 2500, maximumNearClip: 10, toneMapping: TONEMAP_ACES },
    sun: { intensity: 1.35, rotation: [48, -35, 0] as const, shadowResolution: 2048 },
    groundMaterial: { manifest: '/materials/short-grass/material.json', profile: '1k' as const },
    groundSize: 2400,
    groundY: -0.08
};
