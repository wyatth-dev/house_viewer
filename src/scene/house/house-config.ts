import { activeTypology } from '../../typology/index.ts';

/** Calibration of the active typology; read at load time, so a typology switch takes effect on the next load. */
export const houseConfig = {
    get url() {
        return activeTypology().modelUrl;
    },
    get actualWidthMm() {
        return activeTypology().calibration.actualWidthMm;
    },
    get sourceFootprint() {
        return activeTypology().calibration.sourceFootprint;
    },
    get groundY() {
        return activeTypology().calibration.groundY;
    },
    get yawDegrees() {
        return activeTypology().calibration.yawDegrees;
    }
};

export type HouseRepresentation = 'white' | 'color-block' | 'render';
export function houseRepresentationUrls(): Record<HouseRepresentation, string> {
    const url = houseConfig.url;
    return Object.fromEntries(
        Object.entries(activeTypology().representations).map(([mode, { model }]) => [
            mode,
            url.slice(0, url.lastIndexOf('/') + 1) + model
        ])
    ) as Record<HouseRepresentation, string>;
}
