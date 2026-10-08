import type { InstallationWallFace } from '../../product-placement/types.ts';
import { activeTypology } from '../../scenes/typology/index.ts';

/** Installation faces of the active typology, calibrated into scene coordinates by the typology loader. */
export const houseInstallationFaces = (): readonly InstallationWallFace[] => activeTypology().installationFaces;
