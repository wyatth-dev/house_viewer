import { Entity } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { roofJointDatums, rafterDatums } from '../parametric-engine/varenda/datums.ts';
import type { FootingSolution, GutterLayout, PostInstance, ProductPointMm, WallPieceLayout } from '../parametric-engine/varenda/varenda-solver.ts';


import type { ProductAssetStore } from './assets.ts';

import { solveSingleRafter } from '../parametric-engine/varenda/varenda-solver.ts';

// Rendering assets are independent of engineering catalog identities.
const varendaAssets = {
    //footplate
    footplate: '/models/varenda/footplate.glb',
    postBody: '/models/varenda/post-body.glb',
    postSourceLengthMm: 95,
    // gutter
    gutterFixed: '/models/varenda/gutter-fixed.glb',
    gutterMoving: '/models/varenda/gutter-moving.glb',
    gutterSourceLengthMm: 100,
    // wall piece
    wallPieceFixed: '/models/varenda/wallpiece-fixed.glb',
    wallPieceMoving: '/models/varenda/wallpiece-moving.glb',
    wallPieceSourceLengthMm: 100,
    // rafter
    rafterBody: '/models/varenda/rafter-body.glb',
} as const;

export type VarendaViewSolution = Readonly<{
    footings: FootingSolution;
    posts: readonly PostInstance[];
    gutter: GutterLayout;
    wallPiece: WallPieceLayout;
    roofSlope: Readonly<{ slopeDegrees: number }>;
    rafter?: ReturnType<typeof solveSingleRafter>;
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

    const root = new Entity('Varenda');
    app.root.addChild(root);
    let destroyed = false;

    return {
        root,
        update(solution: VarendaViewSolution) {
            if (destroyed) throw new Error('Varenda view is disposed');
            // Build the replacement first so rendering failures retain the old model.
            const next = new Entity('Varenda parts');
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

                if (solution.rafter) {
                    const rafter = solution.rafter;
                    const entity = rafterBody.instantiateRenderEntity();
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
                        1,
                        1,
                        rafter.lengthMm / rafterDatums.body.sourceLengthMm
                    );
                }

            } catch (error) {
                next.destroy();
                throw error;
            }
            for (const child of [...root.children]) child.destroy();
            root.addChild(next);
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            root.destroy();
        }
    };
}
