import { Color, Entity, StandardMaterial } from 'playcanvas';
import type { AppBase, ContainerResource } from 'playcanvas';

import { createProductAssetStore } from '../../shared/assets/containers.ts';
import type { Layout } from '../types.ts';

import { daylightConfig } from './config.ts';

const assetIds = ['cypress-a', 'cypress-b', 'sage-tree-a', 'sage-tree-b', 'yellow-tree', 'shrub-cluster', 'shrub-brown'] as const;
export type LandscapePlant = { asset: typeof assetIds[number]; x: number; z: number; scale: number; yaw: number };

/** Random groups scattered through a finite world region, with the site and front corridor clear. */
export function generatePlanting(layout: Layout, seed = 4207): LandscapePlant[][] {
    let state = seed >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const p = layout.property, front = layout.regions.front.minZ;
    const groups: LandscapePlant[][] = [];
    const range = 50000, margin = 6500;
    const centers: { x: number; z: number; spacing: number }[] = [];
    const minX = p.minX - range + margin, maxX = p.maxX + range - margin;
    const minZ = p.minZ - range + margin, maxZ = p.maxZ + range - margin;
    for (let attempt = 0; attempt < 1600 && groups.length < 24; attempt++) {
            const centerX = minX + random() * (maxX - minX);
            const centerZ = minZ + random() * (maxZ - minZ);
            const nearSite = centerX >= p.minX - margin && centerX <= p.maxX + margin
                && centerZ >= p.minZ - margin && centerZ <= p.maxZ + margin;
            const frontCorridor = centerX >= p.minX - margin && centerX <= p.maxX + margin && centerZ >= front;
            if (nearSite || frontCorridor) continue;
            const distance = Math.hypot(
                Math.max(p.minX - centerX, 0, centerX - p.maxX),
                Math.max(p.minZ - centerZ, 0, centerZ - p.maxZ)
            );
            // Fewer accepted groups and larger gaps as distance from the site increases.
            if (random() > Math.exp(-(distance - margin) / 14000)) continue;
            const spacing = 7500 + distance * 0.22;
            if (centers.some(center => Math.hypot(center.x - centerX, center.z - centerZ) < (center.spacing + spacing) / 2)) continue;
            centers.push({ x: centerX, z: centerZ, spacing });
            const columnGroup = random() < 0.45;
            const trees = columnGroup ? 3 + Math.floor(random() * 3) : 2 + Math.floor(random() * 2);
            const shrubs = 4 + Math.floor(random() * 5);
            const plants: LandscapePlant[] = [];
            for (let plant = 0; plant < trees + shrubs; plant++) {
                const shrub = plant >= trees;
                const asset = shrub ? random() < 0.5 ? 'shrub-cluster' : 'shrub-brown'
                    : columnGroup ? random() < 0.5 ? 'cypress-a' : 'cypress-b'
                    : random() < 0.15 ? 'yellow-tree' : random() < 0.5 ? 'sage-tree-a' : 'sage-tree-b';
                const scale = shrub ? 0.55 + random() * 0.85 : 0.65 + random() * 0.6;
                const angle = random() * Math.PI * 2;
                const spread = shrub ? 2000 + random() * 1000 : 1000 + random() * 1600;
                const x = centerX + Math.cos(angle) * spread;
                const z = centerZ + Math.sin(angle) * spread;
                plants.push({ asset, x, z, scale, yaw: random() * 360 });
            }
            groups.push(plants);
    }
    groups.push([
        { asset: 'yellow-tree', x: p.minX - 3200, z: p.minZ - 3200, scale: 0.75, yaw: 35 },
        { asset: 'sage-tree-a', x: p.maxX + 3200, z: p.minZ - 3200, scale: 0.8, yaw: 120 }
    ]);
    return groups;
}

export function generateHedges(layout: Layout) {
    const p = layout.property, offset = 800;
    const shrubs: (LandscapePlant & { side: string })[] = [];
    const rows = [
        { side: 'back', x0: p.minX - offset, x1: p.maxX + offset, z0: p.minZ - offset, z1: p.minZ - offset },
        { side: 'left', x0: p.minX - offset, x1: p.minX - offset, z0: p.minZ, z1: p.maxZ - 1400 },
        { side: 'right', x0: p.maxX + offset, x1: p.maxX + offset, z0: p.minZ, z1: p.maxZ - 1400 }
    ];
    for (const row of rows) {
        const length = Math.hypot(row.x1 - row.x0, row.z1 - row.z0);
        if (row.z1 < row.z0) continue;
        const count = Math.max(1, Math.ceil(length / 1500));
        for (let index = 0; index <= count; index++) {
            const t = index / count;
            shrubs.push({ side: row.side, asset: index % 5 === 3 ? 'shrub-brown' : 'shrub-cluster',
                x: row.x0 + (row.x1 - row.x0) * t, z: row.z0 + (row.z1 - row.z0) * t,
                scale: 0.75 + (index % 4) * 0.08, yaw: index * 137.5 % 360 });
        }
    }
    return shrubs;
}

export function createPlanting(app: AppBase) {
    const abort = new AbortController();
    const assets = createProductAssetStore(app, abort.signal);
    const root = new Entity('Grouped landscape planting');
    root.enabled = false;
    app.root.addChild(root);
    const boundaryMaterials = new Map<StandardMaterial, StandardMaterial>();
    const hedgeMaterial = new StandardMaterial();
    hedgeMaterial.diffuse = new Color().fromString('#788967');
    hedgeMaterial.gloss = 0;
    hedgeMaterial.update();
    let layout: Layout | undefined;
    let disposed = false;
    let models: Map<string, ContainerResource> | undefined;
    const rebuild = () => {
        if (!layout || disposed) return;
        for (const child of [...root.children]) child.destroy();
        const p = layout.property;
        const height = 1200, thickness = 800, offset = 800;
        for (const wall of [
            { side: 'back', x: (p.minX + p.maxX) / 2, z: p.minZ - offset, width: p.maxX - p.minX + offset * 2 + thickness, depth: thickness },
            { side: 'left', x: p.minX - offset, z: (p.minZ + p.maxZ - 1400) / 2, width: thickness, depth: Math.max(0, p.maxZ - p.minZ - 1400) },
            { side: 'right', x: p.maxX + offset, z: (p.minZ + p.maxZ - 1400) / 2, width: thickness, depth: Math.max(0, p.maxZ - p.minZ - 1400) }
        ]) {
            if (wall.width <= 0 || wall.depth <= 0) continue;
            const entity = new Entity(`${wall.side} hedge core`);
            entity.addComponent('render', { type: 'box', material: hedgeMaterial, castShadows: true, receiveShadows: true });
            entity.setPosition(wall.x, daylightConfig.groundY + height / 2, wall.z);
            entity.setLocalScale(wall.width, height, wall.depth);
            root.addChild(entity);
        }
        if (!models) return;
        const hedgeRow = new Entity('Boundary shrub rows');
        root.addChild(hedgeRow);
        for (const shrub of generateHedges(layout)) {
            const entity = models.get(shrub.asset)!.instantiateRenderEntity();
            entity.name = `${shrub.side} ${shrub.asset}`;
            const index = hedgeRow.children.length;
            const outward = 120 + (index % 3) * 75;
            entity.setPosition(shrub.x + (shrub.side === 'left' ? -outward : shrub.side === 'right' ? outward : 0),
                daylightConfig.groundY + 880 + (index % 3) * 55,
                shrub.z - (shrub.side === 'back' ? outward : 0));
            entity.setLocalScale(shrub.scale, shrub.scale, shrub.scale);
            entity.setEulerAngles(0, shrub.yaw, 0);
            entity.forEach(node => {
                if (node instanceof Entity && node.render) {
                    node.render.castShadows = true;
                    node.render.receiveShadows = true;
                    for (const mesh of node.render.meshInstances) {
                        const source = mesh.material;
                        if (!(source instanceof StandardMaterial)) continue;
                        let material = boundaryMaterials.get(source);
                        if (!material) {
                            material = source.clone();
                            const color = source.diffuse;
                            // Darken the boundary foliage before adding contrast, so highlights stay colored.
                            const contrast = (value: number) => Math.max(0, Math.min(0.62, 0.3 + (value * 0.6 - 0.3) * 1.25));
                            material.diffuse = new Color(contrast(color.r), contrast(color.g), contrast(color.b));
                            material.useMetalness = false;
                            material.specular = new Color(0, 0, 0);
                            material.gloss = 0;
                            material.glossMap = null;
                            material.useSkybox = false;
                            material.emissive = new Color(0, 0, 0);
                            material.update();
                            boundaryMaterials.set(source, material);
                        }
                        mesh.material = material;
                    }
                }
            });
            hedgeRow.addChild(entity);
        }
        for (const [index, group] of generatePlanting(layout).entries()) {
            const cluster = new Entity(`Planting group ${index + 1}`);
            root.addChild(cluster);
            for (const plant of group) {
                const entity = models.get(plant.asset)!.instantiateRenderEntity();
                entity.name = plant.asset;
                entity.setPosition(plant.x, daylightConfig.groundY, plant.z);
                entity.setLocalScale(plant.scale, plant.scale, plant.scale);
                entity.setEulerAngles(0, plant.yaw, 0);
                entity.forEach(node => {
                    if (node instanceof Entity && node.render) { node.render.castShadows = true; node.render.receiveShadows = true; }
                });
                cluster.addChild(entity);
            }
        }
    };
    const ready = Promise.all(assetIds.map(async id => [id, await assets.load(`/site-definition/landscape/3d/${id}.glb`)] as const))
        .then(loaded => { if (!disposed) { models = new Map(loaded); rebuild(); } })
        .catch(error => { if (!disposed) console.warn('Landscape planting could not load', error); });
    return {
        ready,
        updateLayout(value: Layout) { layout = structuredClone(value); rebuild(); },
        setVisible(value: boolean) { root.enabled = value; },
        destroy() { disposed = true; root.destroy(); hedgeMaterial.destroy(); for (const material of boundaryMaterials.values()) material.destroy(); boundaryMaterials.clear(); assets.destroy(); abort.abort(); }
    };
}
