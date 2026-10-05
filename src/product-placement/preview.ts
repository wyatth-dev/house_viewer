import { BLEND_NORMAL, CULLFACE_NONE, Entity, Layer, StandardMaterial } from 'playcanvas';
import type { AppBase, CameraComponent, Material } from 'playcanvas';

import { defaultVarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import { solveVarenda } from '../products/parametric-engine/varenda/solution.ts';
import { createVarendaView } from '../products/varenda/view/varenda-view.ts';
import type { VarendaView } from '../products/varenda/view/varenda-view.ts';
import { createProductAssetStore } from '../shared/assets/containers.ts';
import type { Point3 } from '../shared/geometry/types.ts';

import {
    calculateEnvelopeCorners,
    solvePlacementCandidate,
    getPreviewDimensions,
    editPreviewDimension
} from './geometry.ts';
import type { PreviewDimensionKey } from './geometry.ts';
import type { CustomizableEnvelope, InstallationWallFace } from './types.ts';

/** Transient game-style preview. Owns no committed product instances or dimension UI. */
export function createPlacementPreview(
    app: AppBase,
    walls: readonly InstallationWallFace[],
    getProperty: () => { minX: number; maxX: number; minZ: number; maxZ: number },
    screenToGround: (x: number, y: number, groundYMm?: number) => Point3 | undefined,
    parentSignal: AbortSignal,
    onFeedback: (message: string | undefined) => void,
    getOccupied: () => readonly CustomizableEnvelope[] = () => []
) {
    const abort = new AbortController();
    const cancelLoading = () => abort.abort();
    parentSignal.addEventListener('abort', cancelLoading, { once: true });
    if (parentSignal.aborted) abort.abort();
    const assets = createProductAssetStore(app, abort.signal);
    const previewLayer = new Layer({ name: 'Placement preview' });
    app.scene.layers.push(previewLayer);
    const cameras = app.root.findComponents('camera') as CameraComponent[];
    for (const camera of cameras) camera.layers = [...camera.layers, previewLayer.id];
    let product: VarendaView | undefined;
    let loading: Promise<void> | undefined;
    let disposed = false;
    let active = false;
    let pointer: { x: number; y: number } | undefined;
    let lastShape: string | undefined;
    let candidate: ReturnType<typeof solvePlacementCandidate>;
    let pinnedCandidate: ReturnType<typeof solvePlacementCandidate>;
    let previewParams = { ...defaultVarendaParams };
    let editingDimensions = false;
    const lockedDimensions = new Set<PreviewDimensionKey>();

    const materials = new Map<Material, StandardMaterial>();
    const clearMaterials = () => {
        for (const material of materials.values()) material.destroy();
        materials.clear();
    };
    const render = () => {
        if (!active || !pointer || disposed) {
            candidate = undefined;
            if (product) product.root.enabled = false;
            onFeedback(undefined);
            return;
        }

        // Freeze the current location while a dimension is being edited.
        if (!editingDimensions && pinnedCandidate) candidate = pinnedCandidate;
        if (!editingDimensions && !pinnedCandidate) {
            candidate = undefined;

            for (const wall of walls) {
                const point = screenToGround(pointer.x, pointer.y, wall.originMm.y);

                if (!point) continue;

                candidate = solvePlacementCandidate([wall], getProperty(), point, previewParams, getOccupied());

                if (candidate && lockedDimensions.has('width') && candidate.envelope.widthMm !== previewParams.widthMm)
                    candidate = undefined;
                if (candidate) break;
            }
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
            const params = {
                ...previewParams,
                widthMm: envelope.widthMm,
                depthMm: envelope.depthMm
            };
            const shape = JSON.stringify(params);
            if (shape !== lastShape) {
                const solution = solveVarenda(params);
                product.root.enabled = false;
                product.update(solution);
                clearMaterials();
                product.root.forEach((node) => {
                    if (!(node instanceof Entity) || !node.render) return;
                    node.render.layers = [previewLayer.id];
                    node.render.castShadows = false;
                    node.render.receiveShadows = false;
                    for (const mesh of node.render.meshInstances) {
                        const original = mesh.material;
                        let material = materials.get(original);
                        if (!material) {
                            material = new StandardMaterial();
                            material.blendType = BLEND_NORMAL;
                            material.opacity = 0.45;
                            material.diffuse.set(0.12, 0.85, 0.28);
                            material.useLighting = false;
                            material.cull = CULLFACE_NONE;
                            material.diffuseMap = null;
                            material.emissiveMap = null;
                            material.depthTest = false;
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
        reset() {
            previewParams = { ...defaultVarendaParams };
            lockedDimensions.clear();
            pinnedCandidate = undefined;
            pointer = undefined;
            candidate = undefined;
            editingDimensions = false;
            render();
        },
        setActive(value: boolean) {
            active = value;
            if (!active) editingDimensions = false;
            if (active) ensureLoaded();
            render();
        },

        move(x: number, y: number) {
            pointer = { x, y };
            render();
        },

        leave() {
            if (editingDimensions) return;
            pointer = undefined;
            render();
        },

        refresh: render,

        getCandidate: () => candidate,
        getParams: () => ({ ...previewParams }),
        getDimensionLocks: () => new Set(lockedDimensions),
        toggleDimensionLock(field: PreviewDimensionKey) {
            if (!candidate) return;
            if (lockedDimensions.has(field)) lockedDimensions.delete(field);
            else lockedDimensions.add(field);
            pinnedCandidate = lockedDimensions.has('left') || lockedDimensions.has('right') ? candidate : undefined;
        },

        getDimensionState() {
            if (!candidate || !product?.root.enabled) return undefined;

            return {
                wall: candidate.wall,
                envelope: candidate.envelope,
                lockedDimensions,
                showWidth: false,
                readOnly: true,
                dimensions: getPreviewDimensions(candidate.envelope, candidate.wall, previewParams.wallHeightMm)
            };
        },

        setDimensionEditing(value: boolean) {
            editingDimensions = value && Boolean(candidate);
        },

        editDimensions(field: PreviewDimensionKey, valueMm: number): string | undefined {
            if (!candidate || !product?.root.enabled) {
                return 'Move onto an available area first.';
            }

            try {
                const edited = editPreviewDimension(
                    candidate.envelope,
                    candidate.wall,
                    previewParams.wallHeightMm,
                    field,
                    valueMm,
                    lockedDimensions
                );

                const nextParams = {
                    ...previewParams,
                    widthMm: edited.envelope.widthMm,
                    depthMm: edited.envelope.depthMm,
                    wallHeightMm: edited.wallHeightMm
                };

                solveVarenda(nextParams);

                candidate = {
                    wall: candidate.wall,
                    envelope: edited.envelope
                };
                previewParams = nextParams;
                if (pinnedCandidate) pinnedCandidate = candidate;

                const wasEditing = editingDimensions;
                editingDimensions = true;
                render();
                editingDimensions = wasEditing;

            } catch (error) {
                return error instanceof Error ? error.message : 'Unable to update this dimension.';
            }
        },

        destroy() {
            if (disposed) return;
            disposed = true;
            abort.abort();
            parentSignal.removeEventListener('abort', cancelLoading);
            product?.destroy();
            for (const camera of cameras) camera.layers = camera.layers.filter((id) => id !== previewLayer.id);
            app.scene.layers.remove(previewLayer);
            clearMaterials();
            assets.destroy();
        }
    };
}
