import { Entity } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { FootingSolution, PostInstance, ProductPointMm } from '../parametric-engine/varenda/varenda-solver.ts';

import type { ProductAssetStore } from './assets.ts';

// Rendering assets are independent of engineering catalog identities.
const varendaAssets = {
    footplate: '/models/varenda/footplate.glb',
    postBody: '/models/varenda/post-body.glb',
    postSourceLengthMm: 95
} as const;

export type VarendaViewSolution = Readonly<{
    footings: FootingSolution;
    posts: readonly PostInstance[];
}>;

/** Rhino engineering coordinates -> PlayCanvas local coordinates, both in mm. */
export function placeProductEntity(entity: Entity, point: ProductPointMm) {
    entity.setLocalPosition(point.x, point.z, -point.y);
}

export type VarendaView = Awaited<ReturnType<typeof createVarendaView>>;

export async function createVarendaView(app: Pick<AppBase, 'root'>, assets: ProductAssetStore) {
    const footplate = await assets.load(varendaAssets.footplate);
    const postBody = await assets.load(varendaAssets.postBody);
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
