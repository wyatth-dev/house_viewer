import { Entity, Mesh, MeshInstance } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { Bounds3 } from '../../shared/geometry/types.ts';
import { loadPbrMaterial } from '../materials/index.ts';

import { daylightConfig } from './config.ts';
import { surroundingGeometry } from './ground-geometry.ts';
import { applyTerrainSampling } from './terrain-sampling.ts';

/** Own the realistic outer ring; the existing neutral ground remains the loading fallback. */
export function createSurroundingsMaterial(app: AppBase) {
    const abort = new AbortController();
    let latest: Bounds3 | undefined;
    let release: (() => void) | undefined;
    let updateMesh: ((bounds: Bounds3) => void) | undefined;
    const ready = loadPbrMaterial(
        app.graphicsDevice,
        daylightConfig.groundMaterial.manifest,
        daylightConfig.groundMaterial.profile,
        abort.signal
    )
        .then((asset) => {
            if (abort.signal.aborted) {
                asset.destroy();
                return;
            }
            const mesh = new Mesh(app.graphicsDevice);
            const root = new Entity('Realistic surroundings');
            release = () => {
                const meshOwnedByEntity = !!root.render;
                root.destroy();
                if (!meshOwnedByEntity) mesh.destroy();
                asset.destroy();
            };
            applyTerrainSampling(asset.material, app.graphicsDevice);
            asset.material.bumpiness = 0.18;
            asset.material.aoIntensity = 0.3;
            asset.material.update();
            updateMesh = (bounds) => {
                const data = surroundingGeometry(bounds, daylightConfig.groundSize / 2, daylightConfig.groundY + 20);
                mesh.setPositions(data.positions);
                mesh.setNormals(data.normals);
                mesh.setUvs(0, data.uvs);
                mesh.setIndices(data.indices);
                mesh.update();
            };
            if (latest) updateMesh(latest);
            root.addComponent('render', {
                meshInstances: [new MeshInstance(mesh, asset.material)],
                castShadows: false,
                receiveShadows: true
            });
            root.enabled = !!latest;
            app.root.addChild(root);
            const update = updateMesh;
            updateMesh = (bounds) => {
                update(bounds);
                root.enabled = true;
            };
        })
        .catch((error) => {
            release?.();
            release = undefined;
            updateMesh = undefined;
            if (!abort.signal.aborted)
                console.warn('Surroundings material unavailable; keeping neutral ground.', error);
        });
    return {
        ready,
        updateBounds(bounds: Bounds3) {
            latest = structuredClone(bounds);
            updateMesh?.(bounds);
        },
        destroy() {
            abort.abort();
            release?.();
            release = undefined;
            updateMesh = undefined;
        }
    };
}
