import type { InstallationWallFace } from '../../product-placement/types.ts';
import { defaultTypology } from '../../scenes/typology/index.ts';

/** Local model coordinates are calibrated into scene coordinates by the typology loader. */
export const houseInstallationFaces: readonly InstallationWallFace[] = defaultTypology.installationFaces;
