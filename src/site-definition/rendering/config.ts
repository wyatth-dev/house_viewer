import { TONEMAP_ACES } from 'playcanvas';

export const daylightConfig = {
    camera: { minimumFarClip: 2500000, maximumNearClip: 1000, minimumNearClip: 10, toneMapping: TONEMAP_ACES },
    sun: { intensity: 1.35, rotation: [48, -35, 0] as const, shadowResolution: 4096 },
    groundMaterial: { manifest: '/site-definition/materials/short-grass/material.json', profile: '1k' as const },
    groundSize: 2400000,
    groundY: -80
};

/** Shared palette for the architectural white-model template. */
export const whiteModelPalette = {
    background: '#FAFBFC',
    ground: '#F1F3F5',
    boundary: '#C8CFD5'
};
