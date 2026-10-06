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


/** 场地表现参数集中在这里。距离单位：毫米；颜色：十六进制；不透明度：0–1。 */
export const landscapeConfig = {
    floor: { 
        visible: true,
        color: '#e5e7e2',
        opacity: 1,
        thickness: 100, // 底板厚度，毫米
        scaleX: 1, scaleY: 1, scaleZ: 1, // 相对恢复后底板的比例
        offsetX: 0, offsetY: 0, offsetZ: 0 // 位移，毫米
    },
    world: { color: '#fefefe' }, // 世界地面，比场地草地更浅
    grass: { color: '#abbc86', textureStrength: 0.06, bumpiness: 0.015 },
    planting: {
        seed: 4207,
        range: 50000, // 场地向外延伸 50m
        clearance: 6500,
        maxGroups: 13,
        densityFalloff: 14000, // 越小越集中在近处
        minimumSpacing: 9500,
        distanceSpacing: 0.22,
        columnGroupChance: 0.45,
        yellowTreeChance: 0.15,
        columnTrees: { min: 3, variation: 3 },
        roundTrees: { min: 2, variation: 2 },
        shrubsPerGroup: { min: 4, variation: 5 },
        treeSpread: { min: 1000, variation: 1600 },
        shrubSpread: { min: 2000, variation: 1000 },
        accentOffset: 3200,
        accentScales: [0.75, 0.8],
        treeScale: { min: 0.65, variation: 0.6 },
        shrubScale: { min: 0.55, variation: 0.85 }
    },
    hedge: {
        height: 1200, thickness: 800, rowOffset: 400,
        spacing: 1500, frontSetback: 600,
        color: '#788967',
        shrubScale: { min: 0.75, step: 0.08 },
        shrubBaseHeight: 880, heightStep: 55,
        outwardOffset: 120, outwardStep: 75,
        brownEvery: 5,
        brightness: 0.6, contrast: 1.25
    },
    // 外侧灌木：柔和中间色，80% 不透明度；不影响围合灌木。
    outerShrubs: {
        visible: true, // 上色模式下是否显示树下灌木
        castShadows: false, // 外侧灌木是否向地面投影
        greenColor: '#788967', brownColor: '#a09370', // 直接指定颜色
        brightness: 1, saturation: 1.25, opacity: 0.3
    },
    roundTrees: { brightness: 1, saturation: 3, opacity: 0.3 },
    cypress: { brightness: 1, saturation: 1.7, opacity: 0.7 }
};
