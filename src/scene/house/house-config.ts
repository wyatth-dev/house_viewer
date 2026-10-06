import { defaultTypology } from '../../scenes/typology/index.ts';

/** Calibration is stored with the selected typology's model. */
export const houseConfig = {
    url: defaultTypology.modelUrl,
    ...defaultTypology.calibration
};
