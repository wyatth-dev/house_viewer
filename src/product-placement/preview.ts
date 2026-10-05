import { BLEND_NORMAL, Entity, StandardMaterial } from 'playcanvas';
import type { AppBase, Material } from 'playcanvas';

import { defaultVarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import { solveVarenda } from '../products/parametric-engine/varenda/solution.ts';
import { createVarendaView } from '../products/varenda/view/varenda-view.ts';
import type { VarendaView } from '../products/varenda/view/varenda-view.ts';
import { createProductAssetStore } from '../shared/assets/containers.ts';
import type { Point3 } from '../shared/geometry/types.ts';

import { calculateEnvelopeCorners, solvePlacementCandidate } from './geometry.ts';
import type { InstallationWallFace } from './types.ts';

/** Transient game-style preview. Owns no committed product instances or dimension UI. */
export function createPlacementPreview(
    app: AppBase,
    walls: readonly InstallationWallFace[],
    getProperty: () => { minX: number; maxX: number; minZ: number; maxZ: number },
    screenToGround: (x: number, y: number, groundYMm?: number) => Point3 | undefined,
    parentSignal: AbortSignal,
    onFeedback: (message: string | undefined) => void
) {
    const abort = new AbortController();
    const cancelLoading = () => abort.abort();
    parentSignal.addEventListener('abort', cancelLoading, { once: true });
    if (parentSignal.aborted) abort.abort();
    const assets = createProductAssetStore(app, abort.signal);
    let product: VarendaView | undefined;
    let loading: Promise<void> | undefined;
    let disposed = false;
    let active = false;
    let pointer: { x: number; y: number } | undefined;
    let lastShape: string | undefined;
    let candidate: ReturnType<typeof solvePlacementCandidate>;
    const materials = new Map<Material, StandardMaterial>();
    const clearMaterials = () => {
        for (const material of materials.values()) material.destroy();
        materials.clear();
    };
    const render = () => {
        candidate = undefined;
        if (!active || !pointer || disposed) {
            if (product) product.root.enabled = false;
            onFeedback(undefined);
            return;
        }
        for (const wall of walls) {
            const point = screenToGround(pointer.x, pointer.y, wall.originMm.y);
            if (!point) continue;
            candidate = solvePlacementCandidate([wall], getProperty(), point, defaultVarendaParams);
            if (candidate) break;
        }
        if (!candidate) {
            if (product) product.root.enabled = false;
            onFeedback('Move onto a highlighted area.');
            return;
        }
        if (!product) {
            onFeedback('Loading Varenda preview…');
            return;
        }
        try {
            const { envelope, wall } = candidate;
            const params = { ...defaultVarendaParams, widthMm: envelope.widthMm, depthMm: envelope.depthMm };
            const shape = JSON.stringify(params);
            if (shape !== lastShape) {
                const solution = solveVarenda(params);
                product.root.enabled = false;
                product.update(solution);
                clearMaterials();
                product.root.forEach((node) => {
                    if (!(node instanceof Entity) || !node.render) return;
                    node.render.castShadows = false;
                    node.render.receiveShadows = false;
                    for (const mesh of node.render.meshInstances) {
                        const original = mesh.material;
                        let material = materials.get(original);
                        if (!material) {
                            material = original instanceof StandardMaterial ? original.clone() : new StandardMaterial();
                            material.blendType = BLEND_NORMAL;
                            material.opacity = 0.32;
                            material.depthWrite = false;
                            material.update();
                            materials.set(original, material);
                        }
                        mesh.material = material;
                    }
                });
                lastShape = shape;
            }
            const corner = calculateEnvelopeCorners(envelope, wall).wallStart;
            const along = wall.alongWallUnit,
                outward = wall.outwardUnit;
            const yaw = (Math.atan2(-along.z, along.x) * 180) / Math.PI;
            const handedness = along.x * outward.z - along.z * outward.x;
            product.root.setPosition(corner.x, corner.y, corner.z);
            product.root.setEulerAngles(0, yaw, 0);
            product.root.setLocalScale(1, 1, handedness);
            product.root.enabled = true;
            onFeedback(undefined);
        } catch (error) {
            candidate = undefined;
            product.root.enabled = false;
            onFeedback(error instanceof Error ? error.message : 'Unable to preview this position.');
        }
    };
    const ensureLoaded = () => {
        if (loading || product || disposed) return;
        // Preview does not render fastener-axis diagnostics or mutate shared asset materials.
        loading = createVarendaView({ root: app.root }, assets)
            .then((view) => {
                if (disposed || abort.signal.aborted) {
                    view.destroy();
                    return;
                }
                product = view;
                product.root.name = 'Varenda placement preview';
                product.root.enabled = false;
                render();
            })
            .catch((error) => {
                if (!disposed && !abort.signal.aborted) {
                    active = false;
                    onFeedback(error instanceof Error ? error.message : 'Unable to load Varenda.');
                }
            })
            .finally(() => {
                loading = undefined;
            });
    };
    return {
        setActive(value: boolean) {
            active = value;
            if (active) ensureLoaded();
            render();
        },
        move(x: number, y: number) {
            pointer = { x, y };
            render();
        },
        leave() {
            pointer = undefined;
            render();
        },
        refresh: render,
        getCandidate: () => candidate,
        destroy() {
            if (disposed) return;
            disposed = true;
            abort.abort();
            parentSignal.removeEventListener('abort', cancelLoading);
            product?.destroy();
            clearMaterials();
            assets.destroy();
        }
    };
}
