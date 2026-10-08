import { TONEMAP_ACES } from 'playcanvas';

/**
 * 光照与环境参数，数值取自 house-viewer/src/site-definition/rendering/config.ts。
 * 去掉了草地、绿篱、树木等景观参数（本查看页不显示景观）。
 *
 * 唯一的改动是太阳方位：house-viewer 的 [48, -35, 0] 让阳光几乎正对立面，阴影全部落在房屋背后；
 * 这里改为 [48, -63, 0]，阳光从左前方斜照立面，檐口、窗洞（以及之后的 Varenda）的阴影落在立面和地面上。
 */
export const daylightConfig = {
    camera: { minimumFarClip: 2500000, maximumNearClip: 1000, minimumNearClip: 10, toneMapping: TONEMAP_ACES },
    sun: { intensity: 1.35, shadowIntensity: 0.78, rotation: [48, -63, 0] as const, shadowResolution: 4096 },
    groundSize: 2400000,
    groundY: -2,
    worldColor: '#f3f2ee'
};
