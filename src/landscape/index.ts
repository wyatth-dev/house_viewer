import {
    Color,
    CULLFACE_NONE,
    Entity,
    Mesh,
    MeshInstance,
    PIXELFORMAT_RGBA8,
    StandardMaterial,
    Texture
} from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { Bounds3 } from '../geometry/types.ts';

import { landscapeLayout } from './layout.ts';
import { treeGeometry } from './tree-geometry.ts';

export { landscapeLayout } from './layout.ts';

export function createLandscape(app: AppBase) {
    const root = new Entity('Landscape context');
    app.root.addChild(root);
    const data = treeGeometry();
    const meshes = [data.bark, data.leaves].map((geometry) => {
        const mesh = new Mesh(app.graphicsDevice);
        mesh.setPositions(geometry.positions);
        mesh.setNormals(geometry.normals);
        mesh.setColors(geometry.colors);
        mesh.setIndices(geometry.indices);
        mesh.update();
        return mesh;
    });
    const bark = new StandardMaterial(),
        foliage = new StandardMaterial();
    for (const material of [bark, foliage]) {
        material.diffuse = new Color(1, 1, 1);
        material.diffuseVertexColor = true;
        material.gloss = 0.08;
        material.update();
    }
    foliage.cull = CULLFACE_NONE;
    foliage.update();
    const trees = Array.from({ length: 4 }, (_, i) => {
        const tree = new Entity(`Context tree ${i + 1}`);
        tree.addComponent('render', {
            meshInstances: [new MeshInstance(meshes[0], bark), new MeshInstance(meshes[1], foliage)],
            castShadows: i < 2,
            receiveShadows: true
        });
        root.addChild(tree);
        return tree;
    });
    const asphalt = new StandardMaterial(),
        edging = new StandardMaterial();
    asphalt.diffuse = new Color().fromString('#545A5D');
    asphalt.gloss = 0.12;
    const size = 128,
        pixels = new Uint8Array(size * size * 4);
    let seed = 37;
    for (let i = 0; i < pixels.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const v = 218 + (seed % 25);
        pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
        pixels[i + 3] = 255;
    }
    const texture = new Texture(app.graphicsDevice, {
        name: 'Asphalt grain',
        width: size,
        height: size,
        format: PIXELFORMAT_RGBA8,
        levels: [pixels],
        mipmaps: true
    });
    asphalt.diffuseMap = texture;
    asphalt.diffuseMapTiling.set(2400, 6);
    asphalt.update();
    edging.diffuse = new Color().fromString('#B7B4A8');
    edging.gloss = 0;
    edging.update();
    const surface = new Entity('Road outside front yard'),
        shoulders = new Entity('Road edging');
    for (const [entity, material] of [
        [surface, asphalt],
        [shoulders, edging]
    ] as const) {
        entity.addComponent('render', { type: 'plane', material, castShadows: false, receiveShadows: true });
        root.addChild(entity);
    }
    return {
        updateBounds(property: Bounds3) {
            const layout = landscapeLayout(property);
            layout.trees.forEach((pose, i) => {
                trees[i].setPosition(pose.x, -0.04, pose.z);
                trees[i].setLocalScale(pose.scale, pose.scale, pose.scale);
                trees[i].setEulerAngles(0, pose.yaw, 0);
            });
            surface.setPosition(0, -0.035, layout.road.z);
            surface.setLocalScale(layout.road.length, 1, layout.road.width);
            shoulders.setPosition(0, -0.045, layout.road.z);
            shoulders.setLocalScale(layout.road.length, 1, layout.road.width + layout.road.shoulder * 2);
        },
        destroy() {
            root.destroy();
            bark.destroy();
            foliage.destroy();
            asphalt.destroy();
            edging.destroy();
            texture.destroy();
        }
    };
}
