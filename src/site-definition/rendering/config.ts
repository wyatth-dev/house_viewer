import { TONEMAP_ACES } from 'playcanvas';

export const daylightConfig = {
    camera: { minimumFarClip: 2500000, maximumNearClip: 10000, toneMapping: TONEMAP_ACES },
    sun: { intensity: 1.35, rotation: [48, -35, 0] as const, shadowResolution: 2048 },
    groundMaterial: { manifest: '/site-definition/materials/short-grass/material.json', profile: '1k' as const },
    groundSize: 2400000,
    groundY: -80
};
