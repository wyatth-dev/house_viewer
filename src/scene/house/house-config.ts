import { defaultTypology } from '../../scenes/typology/index.ts';

/** Calibration is stored with the selected typology's model. */
export const houseConfig = {
    url: defaultTypology.modelUrl,
    ...defaultTypology.calibration
};

export type HouseRepresentation = 'white' | 'color-block' | 'render';
export const houseRepresentationUrls: Record<HouseRepresentation, string> = Object.fromEntries(
    Object.entries(defaultTypology.representations).map(([mode, { model }]) => [
        mode, houseConfig.url.slice(0, houseConfig.url.lastIndexOf('/') + 1) + model
    ])
) as Record<HouseRepresentation, string>;
