import { Entity } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { roofJointDatums, rafterDatums, glazingGasketDatums } from '../parametric-engine/varenda/datums.ts';
import type { FootingSolution, GutterLayout, PostInstance, ProductPointMm, WallPieceLayout } from '../parametric-engine/varenda/varenda-solver.ts';


import type { GlazingSolution } from '../parametric-engine/varenda/glazing-solver.ts';
import type { ProductAssetStore } from './assets.ts';

import type { solveRafters, solveRailEndCaps } from '../parametric-engine/varenda/varenda-solver.ts';

// Rendering assets are independent of engineering catalog identities.
const varendaAssets = {
    glassPanel: '/models/varenda/glass-panel.glb',
    //footplate
    footplate: '/models/varenda/footplate.glb',
    postBody: '/models/varenda/post-body.glb',
    postSourceLengthMm: 95,
    // gutter
    gutterFixed: '/models/varenda/gutter-fixed.glb',
    gutterMoving: '/models/varenda/gutter-moving.glb',
    gutterSourceLengthMm: 100,
    gutterEndCap: '/models/varenda/gutter-endcap.glb',
    // wall piece
    wallPieceFixed: '/models/varenda/wallpiece-fixed.glb',
    wallPieceMoving: '/models/varenda/wallpiece-moving.glb',
    wallPieceSourceLengthMm: 100,
    wallPieceEndCap: '/models/varenda/wallpiece-endcap.glb',
    // rafter
    rafterBody: '/models/varenda/rafter-body.glb',
    rafterEndBody: '/models/varenda/rafter-end-body.glb',
    rafterStand: '/models/varenda/rafter-stand.glb',
} as const;

export type VarendaViewSolution = Readonly<{
    footings: FootingSolution;
    posts: readonly PostInstance[];
    gutter: GutterLayout;
    wallPiece: WallPieceLayout;
    roofSlope: Readonly<{ slopeDegrees: number }>;
    rafters?: ReturnType<typeof solveRafters>;
    endCaps?: ReturnType<typeof solveRailEndCaps>;
    glazing?: GlazingSolution;
}>;

/** Rhino engineering coordinates -> PlayCanvas local coordinates, both in mm. */
export function placeProductEntity(entity: Entity, point: ProductPointMm) {
    entity.setLocalPosition(point.x, point.z, -point.y);
}

export type VarendaView = Awaited<ReturnType<typeof createVarendaView>>;

export async function createVarendaView(app: Pick<AppBase, 'root'>, assets: ProductAssetStore) {
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
        support: await assets.load('/models/varenda/glazing-support.glb'),
        'wedge-a': await assets.load('/models/varenda/glazing-wedge-a.glb'),
        'wedge-b': await assets.load('/models/varenda/glazing-wedge-b.glb')
    };
    let glazingDetailVisible = false;
    let gasketEntities: Entity[] = [];
    const root = new Entity('Varenda');
    app.root.addChild(root);
    let destroyed = false;

    return {
        root,
        setGlazingDetailVisible(visible: boolean) {
            glazingDetailVisible = visible;
            for (const entity of gasketEntities) entity.enabled = visible;
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
                    ['Gutter moving', gutterMoving, solution.gutter, varendaAssets.gutterSourceLengthMm, roofJointDatums.gutter],
                    ['Wall Piece fixed', wallPieceFixed, solution.wallPiece, varendaAssets.wallPieceSourceLengthMm, null],
                    ['Wall Piece moving', wallPieceMoving, solution.wallPiece, varendaAssets.wallPieceSourceLengthMm, roofJointDatums.wallPiece]
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
                        pivot.setLocalEulerAngles(
                            solution.roofSlope.slopeDegrees - joint.sourceAngleDegrees,
                            0,
                            0
                        );
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
                    entity.setLocalEulerAngles(panel.slopeRadians * 180 / Math.PI, 0, 0);
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
                    entity.setLocalEulerAngles(gasket.slopeRadians * 180 / Math.PI, 0, 0);
                    entity.setLocalScale(gasket.mirrorX ? -1 : 1, 1,
                        (gasket.mirrorY ? -1 : 1) * gasket.lengthMm / glazingGasketDatums.sideSourceLengthMm);
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
                    const bodyAsset = rafter.bodyKind === 'end'
                        ? rafterEndBody
                        : rafterBody;
                    
                    const entity = bodyAsset.instantiateRenderEntity();
                    
                    entity.name = rafter.instanceId;
                    next.addChild(entity);

                    placeProductEntity(entity, rafter.positionMm);
                    entity.setLocalEulerAngles(
                        rafter.slopeRadians * 180 / Math.PI,
                        0,
                        0
                    );

                    // 导出后的长度轴为 PlayCanvas Z；截面保持原尺寸。
                    entity.setLocalScale(
                        rafter.mirrorX ? -1 : 1,
                        1,
                        rafter.lengthMm / rafterDatums.body.sourceLengthMm
                    );

                    for (const placement of [
                        rafter.stands.front,
                        rafter.stands.rear
                    ]) {
                        const pivot = new Entity(`${placement.instanceId} pivot`);
                        next.addChild(pivot);

                        placeProductEntity(pivot, placement.positionMm);
                        pivot.setLocalEulerAngles(
                            rafter.slopeRadians * 180 / Math.PI,
                            0,
                            0
                        );

                        const stand = rafterStand.instantiateRenderEntity();
                        stand.name = placement.instanceId;
                        pivot.addChild(stand);

                        // Rhino Y 对应 PlayCanvas Z。
                        stand.setLocalScale(
                            placement.mirrorX ? -1 : 1,
                            1,
                            placement.mirrorY ? -1 : 1
                        );
                    }
                }

            } catch (error) {
                next.destroy();
                throw error;
            }
            for (const child of [...root.children]) child.destroy();
            root.addChild(next);
            gasketEntities = nextGasketEntities;
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            root.destroy();
        }
    };
}
