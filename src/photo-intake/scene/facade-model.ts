/** 加载一个构建版本的三种表示（white / color-block / render），按需切换显示。 */
import { Entity } from 'playcanvas';
import type { AppBase, Asset, BoundingBox, ContainerResource } from 'playcanvas';

import { loadContainer } from '../../shared/assets/containers.ts';
import type { Bounds3 } from '../../shared/geometry/types.ts';

export type Representation = 'white' | 'color-block' | 'render';
export const REPRESENTATIONS: [Representation, string][] = [
    ['white', 'White model'],
    ['color-block', 'Color blocks'],
    ['render', 'Detailed render']
];
const FILES: Record<Representation, string> = {
    white: 'model.glb',
    'color-block': 'color-block/model.glb',
    render: 'render/model.glb'
};

export type FacadeModel = Awaited<ReturnType<typeof loadFacadeModel>>;

export async function loadFacadeModel(app: AppBase, buildUrl: string, signal: AbortSignal) {
    const modes = REPRESENTATIONS.map(([mode]) => mode);
    const assets: Asset[] = await Promise.all(modes.map((mode) => loadContainer(app.assets, `${buildUrl}/${FILES[mode]}`, signal)));
    const root = new Entity('Facade model');
    const variants = new Map<Representation, Entity>();
    modes.forEach((mode, index) => {
        const entity = (assets[index].resource as ContainerResource).instantiateRenderEntity();
        entity.forEach((node) => {
            if (node instanceof Entity && node.render) {
                node.render.castShadows = true;
                node.render.receiveShadows = true;
            }
        });
        entity.enabled = false;
        root.addChild(entity);
        variants.set(mode, entity);
    });
    const bounds = measureBounds(variants.get('render')!);
    return {
        entity: root,
        bounds,
        setRepresentation(mode: Representation) {
            for (const [key, entity] of variants) entity.enabled = key === mode;
        },
        destroy() {
            root.destroy();
            for (const asset of assets) {
                asset.unload();
                app.assets.remove(asset);
            }
        }
    };
}

function measureBounds(entity: Entity): Bounds3 {
    let box: BoundingBox | undefined;
    entity.forEach((node) => {
        if (node instanceof Entity && node.render)
            for (const mesh of node.render.meshInstances) {
                if (box) box.add(mesh.aabb);
                else box = mesh.aabb.clone();
            }
    });
    if (!box) throw new Error('The model contains no renderable meshes');
    const min = box.getMin(),
        max = box.getMax();
    return { min: { x: min.x, y: min.y, z: min.z }, max: { x: max.x, y: max.y, z: max.z } };
}
