import { Color, Entity, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { ProductAssetStore } from '../../../shared/assets/containers.ts';
import type { CameraBasis } from '../../../shared/camera/types.ts';
import { roofJointDatums, rafterDatums, glazingGasketDatums } from '../../parametric-engine/varenda/datums.ts';
import { getInstalledFasteners } from '../../parametric-engine/varenda/production-list.ts';
import type { InstalledFastener } from '../../parametric-engine/varenda/production-list.ts';
import type { VarendaGeometry } from '../../parametric-engine/varenda/solution.ts';
import type { ProductPointMm } from '../../parametric-engine/varenda/varenda-solver.ts';

import { varendaAssets } from './assets.ts';
import { axisBounds, axisEndpoints } from './fastener-axes.ts';
import { combineBounds, createSelectionMaterials, entityBounds, meshTargets } from './selection.ts';

export type VarendaViewSolution = VarendaGeometry;

/** Rhino engineering coordinates -> PlayCanvas local coordinates, both in mm. */
export function placeProductEntity(entity: Entity, point: ProductPointMm) {
    entity.setLocalPosition(point.x, point.z, -point.y);
}

export type VarendaView = Awaited<ReturnType<typeof createVarendaView>>;

export async function createVarendaView(
    app: Pick<AppBase, 'root'> & Partial<Pick<AppBase, 'drawLine' | 'on' | 'off'>>,
    assets: ProductAssetStore
) {
    const footplate = await assets.load(varendaAssets.footplate);
    const postBody = await assets.load(varendaAssets.postBody);
    const gutterFixed = await assets.load(varendaAssets.gutterFixed);
    const gutterMoving = await assets.load(varendaAssets.gutterMoving);
    const wallPieceFixed = await assets.load(varendaAssets.wallPieceFixed);
    const wallPieceMoving = await assets.load(varendaAssets.wallPieceMoving);
    const rafterBody = await assets.load(varendaAssets.rafterBody);
    const rafterEndBody = await assets.load(varendaAssets.rafterEndBody);
    const rafterStand = await assets.load(varendaAssets.rafterStand);
    const gutterEndCap = await assets.load(varendaAssets.gutterEndCap);
    const wallPieceEndCap = await assets.load(varendaAssets.wallPieceEndCap);

    const glassPanel = await assets.load(varendaAssets.glassPanel);
    const sideGaskets = {
        support: await assets.load(varendaAssets.glazingSupport),
        'wedge-a': await assets.load(varendaAssets.glazingWedgeA),
        'wedge-b': await assets.load(varendaAssets.glazingWedgeB)
    };
    let glazingDetailVisible = false;
    let gasketEntities: Entity[] = [];
    const root = new Entity('Varenda');
    app.root.addChild(root);
    let destroyed = false;
    let registry = new Map<string, Entity[]>();
    let hardware: InstalledFastener[] = [];
    let fastenerAxesVisible = true;
    let selected = new Set<string>();
    let context = new Set<string>();
    const materials = createSelectionMaterials();
    const refreshDetails = () => {
        for (const entity of gasketEntities)
            entity.enabled = glazingDetailVisible || selected.has(entity.name) || context.has(entity.name);
    };
    const clearSelection = () => {
        selected.clear();
        context.clear();
        materials.clear();
        refreshDetails();
    };
    const drawAxes = () => {
        if (!fastenerAxesVisible) return;
        for (const fastener of hardware) {
            const [a, b] = axisEndpoints(root, fastener);
            const active = selected.has(fastener.instanceId);
            app.drawLine?.(
                a,
                b,
                new Color(
                    active ? 1 : 0.32,
                    active ? 0.52 : 0.48,
                    active ? 0.05 : 0.4,
                    selected.size && !active && !context.has(fastener.instanceId) ? 0.12 : 1
                ),
                !active
            );
        }
    };
    app.on?.('update', drawAxes);

    return {
        root,
        clearSelection,
        getViewBasis(instanceId?: string, parentId?: string): CameraBasis {
            // Hardware axes inherit the component they were selected from.
            const entity = registry.get(instanceId ?? '')?.[0] ?? registry.get(parentId ?? '')?.[0] ?? root;
            const matrix = entity.getWorldTransform();
            const axis = (x: number, y: number, z: number) => {
                const value = matrix.transformVector(new Vec3(x, y, z)).normalize();
                return { x: value.x, y: value.y, z: value.z };
            };
            return { right: axis(1, 0, 0), up: axis(0, 1, 0), front: axis(0, 0, 1) };
        },
        getBounds() {
            return entityBounds(root);
        },
        select(instanceIds: readonly string[], contextIds: readonly string[] = []) {
            clearSelection();
            const valid = instanceIds.filter((id) => registry.has(id) || hardware.some((h) => h.instanceId === id));
            if (!valid.length) return undefined;
            selected = new Set(valid);
            context = new Set(contextIds);
            refreshDetails();
            const entities = valid.flatMap((id) => registry.get(id) ?? []);
            const contextEntities = contextIds.flatMap((id) => registry.get(id) ?? []);
            materials.apply(
                root,
                new Set(entities.flatMap(meshTargets)),
                new Set(contextEntities.flatMap(meshTargets))
            );
            return combineBounds([
                ...entities.map(entityBounds),
                ...hardware.filter((h) => selected.has(h.instanceId)).map((h) => axisBounds(root, h))
            ]);
        },
        setFastenerAxesVisible(visible: boolean) {
            fastenerAxesVisible = visible;
        },
        setGlazingDetailVisible(visible: boolean) {
            glazingDetailVisible = visible;
            refreshDetails();
        },
        update(solution: VarendaViewSolution) {
            if (destroyed) throw new Error('Varenda view is disposed');
            // Build the replacement first so rendering failures retain the old model.
            const next = new Entity('Varenda parts');
            const nextGasketEntities: Entity[] = [];
            try {
                for (const footing of solution.footings.assemblies) {
                    const entity = footplate.instantiateRenderEntity();
                    entity.name = footing.instanceId;
                    next.addChild(entity);
                    placeProductEntity(entity, footing.positionMm);
                }

                for (const post of solution.posts) {
                    const entity = postBody.instantiateRenderEntity();
                    entity.name = post.instanceId;
                    next.addChild(entity);
                    placeProductEntity(entity, post.positionMm);
                    // Only profile geometry inherits this stretch; hardware stays separate.
                    entity.setLocalScale(1, post.lengthMm / varendaAssets.postSourceLengthMm, 1);
                }

                for (const [name, resource, layout, sourceLength, joint] of [
                    ['Gutter fixed', gutterFixed, solution.gutter, varendaAssets.gutterSourceLengthMm, null],
                    [
                        'Gutter moving',
                        gutterMoving,
                        solution.gutter,
                        varendaAssets.gutterSourceLengthMm,
                        roofJointDatums.gutter
                    ],
                    [
                        'Wall Piece fixed',
                        wallPieceFixed,
                        solution.wallPiece,
                        varendaAssets.wallPieceSourceLengthMm,
                        null
                    ],
                    [
                        'Wall Piece moving',
                        wallPieceMoving,
                        solution.wallPiece,
                        varendaAssets.wallPieceSourceLengthMm,
                        roofJointDatums.wallPiece
                    ]
                ] as const) {
                    const entity = resource.instantiateRenderEntity();
                    entity.name = name;

                    if (joint) {
                        const pivot = new Entity(`${name} pivot`);
                        next.addChild(pivot);
                        placeProductEntity(pivot, {
                            x: layout.positionMm.x,
                            y: layout.positionMm.y + joint.pivotMm.y,
                            z: layout.positionMm.z + joint.pivotMm.z
                        });
                        pivot.addChild(entity);
                        // Assets share the installation origin; offset it back from the hinge.
                        // Both hinge X coordinates are zero, so width scaling leaves them fixed.
                        placeProductEntity(entity, {
                            x: 0,
                            y: -joint.pivotMm.y,
                            z: -joint.pivotMm.z
                        });
                        pivot.setLocalEulerAngles(solution.roofSlope.slopeDegrees - joint.sourceAngleDegrees, 0, 0);
                    } else {
                        next.addChild(entity);
                        placeProductEntity(entity, layout.positionMm);
                    }
                    entity.setLocalScale(layout.lengthMm / sourceLength, 1, 1);
                }

                for (const panel of solution.glazing?.glass ?? []) {
                    const entity = glassPanel.instantiateRenderEntity();
                    entity.name = panel.instanceId;
                    next.addChild(entity);
                    placeProductEntity(entity, panel.positionMm);
                    entity.setLocalEulerAngles((panel.slopeRadians * 180) / Math.PI, 0, 0);
                    // Unit cube is centered on the solid center; thickness never stretches with roof length.
                    entity.setLocalScale(panel.widthMm, panel.thicknessMm, panel.lengthMm);
                }
                for (const gasket of solution.glazing?.gaskets ?? []) {
                    if (gasket.renderOwnerInstanceId) continue;
                    if (gasket.role !== 'support' && gasket.role !== 'wedge-a' && gasket.role !== 'wedge-b') continue;
                    const entity = sideGaskets[gasket.role].instantiateRenderEntity();
                    entity.name = gasket.instanceId;
                    next.addChild(entity);
                    placeProductEntity(entity, gasket.positionMm);
                    entity.setLocalEulerAngles((gasket.slopeRadians * 180) / Math.PI, 0, 0);
                    entity.setLocalScale(
                        gasket.mirrorX ? -1 : 1,
                        1,
                        ((gasket.mirrorY ? -1 : 1) * gasket.lengthMm) / glazingGasketDatums.sideSourceLengthMm
                    );
                    entity.enabled = glazingDetailVisible;
                    nextGasketEntities.push(entity);
                }

                for (const plate of solution.endCaps?.plates ?? []) {
                    const asset = plate.railRef.instanceId === 'gutter' ? gutterEndCap : wallPieceEndCap;
                    const entity = asset.instantiateRenderEntity();
                    entity.name = plate.instanceId;
                    next.addChild(entity);
                    placeProductEntity(entity, plate.positionMm);
                    entity.setLocalScale(plate.mirrorX ? -1 : 1, 1, 1);
                }

                for (const rafter of solution.rafters ?? []) {
                    const bodyAsset = rafter.bodyKind === 'end' ? rafterEndBody : rafterBody;

                    const entity = bodyAsset.instantiateRenderEntity();

                    entity.name = rafter.instanceId;
                    next.addChild(entity);

                    placeProductEntity(entity, rafter.positionMm);
                    entity.setLocalEulerAngles((rafter.slopeRadians * 180) / Math.PI, 0, 0);

                    // 导出后的长度轴为 PlayCanvas Z；截面保持原尺寸。
                    entity.setLocalScale(
                        rafter.mirrorX ? -1 : 1,
                        1,
                        rafter.lengthMm / rafterDatums.body.sourceLengthMm
                    );

                    for (const placement of [rafter.stands.front, rafter.stands.rear]) {
                        const pivot = new Entity(`${placement.instanceId} pivot`);
                        next.addChild(pivot);

                        placeProductEntity(pivot, placement.positionMm);
                        pivot.setLocalEulerAngles((rafter.slopeRadians * 180) / Math.PI, 0, 0);

                        const stand = rafterStand.instantiateRenderEntity();
                        stand.name = placement.instanceId;
                        pivot.addChild(stand);

                        // Rhino Y 对应 PlayCanvas Z。
                        stand.setLocalScale(placement.mirrorX ? -1 : 1, 1, placement.mirrorY ? -1 : 1);
                    }
                }
            } catch (error) {
                next.destroy();
                throw error;
            }
            clearSelection();
            for (const child of [...root.children]) child.destroy();
            root.addChild(next);
            gasketEntities = nextGasketEntities;
            registry = new Map();
            next.forEach((node) => {
                if (node instanceof Entity) registry.set(node.name, [node]);
            });
            for (const [id, name, metalNode] of [
                ['gutter-fixed', 'Gutter fixed', undefined],
                ['gutter-moving', 'Gutter moving', '5110010015 - Veranda Ring beam Swivel v2'],
                ['wallpiece-fixed', 'Wall Piece fixed', undefined],
                ['wallpiece-moving', 'Wall Piece moving', '5110010035 - Veranda Wallplate Swivel v2']
            ]) {
                const owner = next.findByName(name!);
                const entity = metalNode ? owner?.findByName(metalNode) : owner;
                if (entity instanceof Entity) registry.set(id!, [entity]);
            }
            for (const gasket of solution.glazing?.gaskets ?? []) {
                if (!gasket.renderOwnerInstanceId) continue;
                const owner = next.findByName(
                    gasket.renderOwnerInstanceId === 'gutter' ? 'Gutter moving' : 'Wall Piece moving'
                );
                const name =
                    gasket.role === 'top-seal'
                        ? 'Wallplate Top Seal Gasket'
                        : gasket.role === 'support'
                          ? 'Glazing Support Gasket'
                          : 'Glazing Seal Gasket';
                const target = owner?.findByName(name);
                if (target instanceof Entity) registry.set(gasket.instanceId, [target]);
            }
            hardware = getInstalledFasteners(solution);
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            materials.clear();
            app.off?.('update', drawAxes);
            root.destroy();
        }
    };
}
