import { BLEND_NORMAL, Color, Entity, Mesh, MeshInstance, StandardMaterial } from 'playcanvas';
import type { AppBase, ContainerResource } from 'playcanvas';

import { createProductAssetStore } from '../../shared/assets/containers.ts';
import type { Layout } from '../types.ts';

import { daylightConfig, landscapeConfig } from './config.ts';

const assetIds = ['cypress-a', 'cypress-b', 'sage-tree-a', 'sage-tree-b', 'yellow-tree', 'shrub-cluster', 'shrub-brown'] as const;
export type LandscapePlant = { asset: typeof assetIds[number]; x: number; z: number; scale: number; yaw: number };

/** Random groups scattered through a finite world region, with the site and front corridor clear. */
export function generatePlanting(layout: Layout, seed = landscapeConfig.planting.seed): LandscapePlant[][] {
    let state = seed >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const p = layout.property, front = layout.regions.front.minZ;
    const groups: LandscapePlant[][] = [];
    const range = landscapeConfig.planting.range, margin = landscapeConfig.planting.clearance;
    const centers: { x: number; z: number; spacing: number }[] = [];
    const minX = p.minX - range + margin, maxX = p.maxX + range - margin;
    const minZ = p.minZ - range + margin, maxZ = p.maxZ + range - margin;
    for (let attempt = 0; attempt < 1600 && groups.length < landscapeConfig.planting.maxGroups; attempt++) {
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
            if (random() > Math.exp(-(distance - margin) / landscapeConfig.planting.densityFalloff)) continue;
            const spacing = landscapeConfig.planting.minimumSpacing + distance * landscapeConfig.planting.distanceSpacing;
            if (centers.some(center => Math.hypot(center.x - centerX, center.z - centerZ) < (center.spacing + spacing) / 2)) continue;
            centers.push({ x: centerX, z: centerZ, spacing });
            const columnGroup = random() < landscapeConfig.planting.columnGroupChance;
            const treeCount = columnGroup ? landscapeConfig.planting.columnTrees : landscapeConfig.planting.roundTrees;
            const trees = treeCount.min + Math.floor(random() * treeCount.variation);
            const shrubs = landscapeConfig.planting.shrubsPerGroup.min + Math.floor(random() * landscapeConfig.planting.shrubsPerGroup.variation);
            const plants: LandscapePlant[] = [];
            for (let plant = 0; plant < trees + shrubs; plant++) {
                const shrub = plant >= trees;
                const asset = shrub ? random() < 0.5 ? 'shrub-cluster' : 'shrub-brown'
                    : columnGroup ? random() < 0.5 ? 'cypress-a' : 'cypress-b'
                    : random() < landscapeConfig.planting.yellowTreeChance ? 'yellow-tree' : random() < 0.5 ? 'sage-tree-a' : 'sage-tree-b';
                const scale = shrub ? landscapeConfig.planting.shrubScale.min + random() * landscapeConfig.planting.shrubScale.variation : landscapeConfig.planting.treeScale.min + random() * landscapeConfig.planting.treeScale.variation;
                const angle = random() * Math.PI * 2;
                const spreadConfig = shrub ? landscapeConfig.planting.shrubSpread : landscapeConfig.planting.treeSpread;
                const spread = spreadConfig.min + random() * spreadConfig.variation;
                const x = centerX + Math.cos(angle) * spread;
                const z = centerZ + Math.sin(angle) * spread;
                plants.push({ asset, x, z, scale, yaw: random() * 360 });
            }
            groups.push(plants);
    }
    groups.push([
        { asset: 'yellow-tree', x: p.minX - landscapeConfig.planting.accentOffset, z: p.minZ - landscapeConfig.planting.accentOffset, scale: landscapeConfig.planting.accentScales[0], yaw: 35 },
        { asset: 'sage-tree-a', x: p.maxX + landscapeConfig.planting.accentOffset, z: p.minZ - landscapeConfig.planting.accentOffset, scale: landscapeConfig.planting.accentScales[1], yaw: 120 }
    ]);
    return groups;
}

export function generateHedges(layout: Layout) {
    const p = layout.property, offset = landscapeConfig.hedge.rowOffset;
    const shrubs: (LandscapePlant & { side: string })[] = [];
    const rows = [
        { side: 'back', x0: p.minX - offset, x1: p.maxX + offset, z0: p.minZ - offset, z1: p.minZ - offset },
        { side: 'left', x0: p.minX - offset, x1: p.minX - offset, z0: p.minZ, z1: p.maxZ - landscapeConfig.hedge.frontSetback },
        { side: 'right', x0: p.maxX + offset, x1: p.maxX + offset, z0: p.minZ, z1: p.maxZ - landscapeConfig.hedge.frontSetback }
    ];
    for (const row of rows) {
        const length = Math.hypot(row.x1 - row.x0, row.z1 - row.z0);
        if (row.z1 < row.z0) continue;
        const count = Math.max(1, Math.ceil(length / landscapeConfig.hedge.spacing));
        for (let index = 0; index <= count; index++) {
            const t = index / count;
            shrubs.push({ side: row.side, asset: index % landscapeConfig.hedge.brownEvery === 3 ? 'shrub-brown' : 'shrub-cluster',
                x: row.x0 + (row.x1 - row.x0) * t, z: row.z0 + (row.z1 - row.z0) * t,
                scale: landscapeConfig.hedge.shrubScale.min + (index % 4) * landscapeConfig.hedge.shrubScale.step, yaw: index * 137.5 % 360 });
        }
    }
    return shrubs;
}

export function hedgeGeometry(layout: Layout) {
    const p = layout.property, thickness = landscapeConfig.hedge.thickness;
    const bottom = daylightConfig.groundY, top = bottom + landscapeConfig.hedge.height;
    const outline = [
        [p.minX - thickness, p.maxZ], [p.minX - thickness, p.minZ - thickness],
        [p.maxX + thickness, p.minZ - thickness], [p.maxX + thickness, p.maxZ],
        [p.maxX, p.maxZ], [p.maxX, p.minZ], [p.minX, p.minZ], [p.minX, p.maxZ]
    ];
    const positions: number[] = [], normals: number[] = [], indices: number[] = [];
    const quad = (points: number[][], normal: number[]) => {
        const offset = positions.length / 3;
        for (const point of points) { positions.push(...point); normals.push(...normal); }
        const a = points[0], b = points[1], c = points[2];
        const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
        const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const face = cross.reduce((sum, value, i) => sum + value * normal[i], 0) > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        indices.push(...face.map(index => index + offset));
    };
    for (const [x0, x1, z0, z1] of [
        [p.minX - thickness, p.maxX + thickness, p.minZ - thickness, p.minZ],
        [p.minX - thickness, p.minX, p.minZ, p.maxZ],
        [p.maxX, p.maxX + thickness, p.minZ, p.maxZ]
    ]) {
        for (const [y, direction] of [[top, 1], [bottom, -1]])
            quad([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, direction, 0]);
    }
    for (let index = 0; index < outline.length; index++) {
        const a = outline[index], b = outline[(index + 1) % outline.length];
        const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
        quad([[a[0], bottom, a[1]], [b[0], bottom, b[1]], [b[0], top, b[1]], [a[0], top, a[1]]], [dz / length, 0, -dx / length]);
    }
    return { positions, normals, indices };
}

export function createPlanting(app: AppBase) {
    const abort = new AbortController();
    const assets = createProductAssetStore(app, abort.signal);
    const root = new Entity('Grouped landscape planting');
    root.enabled = false;
    app.root.addChild(root);
    const boundaryMaterials = new Map<StandardMaterial, StandardMaterial>();
    const worldPlantMaterials = new Map<StandardMaterial, StandardMaterial>();
    const hedgeMaterial = new StandardMaterial();
    hedgeMaterial.diffuse = new Color().fromString(landscapeConfig.hedge.color);
    hedgeMaterial.gloss = 0;
    hedgeMaterial.update();
    const originalShadows = new WeakMap<Entity, boolean>();
    const originalOpacities = new WeakMap<StandardMaterial, number>();
    let treeOpacity = 1;
    let whiteMode = false;
    let hedgeVisible = false;
    let hedgeOpacity = 0;
    const animateHedge = (dt: number) => {
        const target = hedgeVisible ? 1 : 0;
        hedgeOpacity += Math.sign(target - hedgeOpacity) * Math.min(Math.abs(target - hedgeOpacity), dt / 0.35);
        hedgeMaterial.opacity = hedgeOpacity;
        hedgeMaterial.blendType = BLEND_NORMAL;
        hedgeMaterial.depthWrite = hedgeOpacity >= 1;
        hedgeMaterial.update();
        const wall = root.findByName('Continuous U hedge core');
        if (wall) wall.enabled = hedgeVisible || hedgeOpacity > 0;
        if (hedgeOpacity === target) app.off('update', animateHedge);
    };
    const applyMode = () => {
        for (const child of root.children) {
            const hedge = child.name === 'Continuous U hedge core' || child.name === 'Boundary shrub rows';
            child.enabled = child.name !== 'Boundary shrub rows' && (hedge ? hedgeVisible || hedgeOpacity > 0 : treeOpacity > 0);
            if (hedge) continue;
            for (const plant of child.children) {
                if (plant.name.startsWith('shrub-')) plant.enabled = landscapeConfig.outerShrubs.visible && treeOpacity > 0;
            }
            child.forEach(node => {
                if (!(node instanceof Entity) || !node.render) return;
                if (!originalShadows.has(node)) originalShadows.set(node, node.render.castShadows);
                node.render.castShadows = treeOpacity > 0.5 && originalShadows.get(node)!;
                for (const mesh of node.render.meshInstances) {
                    if (!(mesh.material instanceof StandardMaterial)) continue;
                    const material = mesh.material;
                    if (!originalOpacities.has(material)) originalOpacities.set(material, material.opacity);
                    material.opacity = originalOpacities.get(material)! * treeOpacity;
                    material.blendType = BLEND_NORMAL;
                    material.depthWrite = material.opacity >= 1;
                    material.update();
                }
            });
        }
    };
    const animateTrees = (dt: number) => {
        const target = whiteMode ? 0 : 1;
        treeOpacity += Math.sign(target - treeOpacity) * Math.min(Math.abs(target - treeOpacity), dt / 0.4);
        applyMode();
        if (treeOpacity === target) app.off('update', animateTrees);
    };
    let layout: Layout | undefined;
    let disposed = false;
    let models: Map<string, ContainerResource> | undefined;
    const rebuild = () => {
        if (!layout || disposed) return;
        for (const child of [...root.children]) child.destroy();
        const geometry = hedgeGeometry(layout);
        const mesh = new Mesh(app.graphicsDevice);
        mesh.setPositions(geometry.positions); mesh.setNormals(geometry.normals);
        mesh.setIndices(geometry.indices); mesh.update();
        const wall = new Entity('Continuous U hedge core');
        wall.addComponent('render', { meshInstances: [new MeshInstance(mesh, hedgeMaterial)], castShadows: true, receiveShadows: true });
        root.addChild(wall);
        if (!models) return;
        const hedgeRow = new Entity('Boundary shrub rows');
        root.addChild(hedgeRow);
        for (const shrub of generateHedges(layout)) {
            const entity = models.get(shrub.asset)!.instantiateRenderEntity();
            entity.name = `${shrub.side} ${shrub.asset}`;
            const index = hedgeRow.children.length;
            const outward = landscapeConfig.hedge.outwardOffset + (index % 3) * landscapeConfig.hedge.outwardStep;
            entity.setPosition(shrub.x + (shrub.side === 'left' ? -outward : shrub.side === 'right' ? outward : 0),
                daylightConfig.groundY + landscapeConfig.hedge.shrubBaseHeight + (index % 3) * landscapeConfig.hedge.heightStep,
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
                            const contrast = (value: number) => Math.max(0, Math.min(0.62, 0.3 + (value * landscapeConfig.hedge.brightness - 0.3) * landscapeConfig.hedge.contrast));
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
                    if (node instanceof Entity && node.render) {
                        node.render.castShadows = plant.asset.startsWith('shrub') ? landscapeConfig.outerShrubs.castShadows : true;
                        node.render.receiveShadows = true;
                        for (const mesh of node.render.meshInstances) {
                            const source = mesh.material;
                            if (!(source instanceof StandardMaterial)) continue;
                            let material = worldPlantMaterials.get(source);
                            if (!material) {
                                material = source.clone();
                                const color = plant.asset.startsWith('shrub')
                                    ? new Color().fromString(plant.asset === 'shrub-brown' ? landscapeConfig.outerShrubs.brownColor : landscapeConfig.outerShrubs.greenColor)
                                    : source.diffuse;
                                if (plant.asset.startsWith('cypress') && color.g > color.r * 1.1) {
                                    const gray = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
                                    const saturated = (value: number) => Math.max(0, Math.min(0.62, (gray + (value - gray) * landscapeConfig.cypress.saturation) * landscapeConfig.cypress.brightness));
                                    material.diffuse = new Color(saturated(color.r), saturated(color.g), saturated(color.b));
                                } else if (!plant.asset.startsWith('cypress')) {
                                    const gray = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
                                    const style = plant.asset.startsWith('shrub') ? landscapeConfig.outerShrubs : landscapeConfig.roundTrees;
                                    const toned = (value: number) => Math.max(0, Math.min(0.8, (gray + (value - gray) * style.saturation) * style.brightness));
                                    material.diffuse = new Color(toned(color.r), toned(color.g), toned(color.b));
                                }
                                if (plant.asset.startsWith('shrub')) material.useTonemap = false;
                                material.useMetalness = false;
                                material.specular = new Color(0, 0, 0);
                                material.gloss = 0;
                                material.glossMap = null;
                                material.useSkybox = false;
                                material.emissive = new Color(0, 0, 0);
                                const appearance = plant.asset.startsWith('cypress') ? landscapeConfig.cypress
                                    : plant.asset.startsWith('shrub') ? landscapeConfig.outerShrubs : landscapeConfig.roundTrees;
                                const requestedOpacity = 'opacity' in appearance ? appearance.opacity : 1;
                                const opacity = typeof requestedOpacity === 'number' && Number.isFinite(requestedOpacity)
                                    ? Math.max(0, Math.min(1, requestedOpacity)) : 1;
                                material.opacity = opacity;
                                if (opacity < 1) material.blendType = BLEND_NORMAL;
                                material.depthWrite = opacity >= 1;
                                material.update();
                                worldPlantMaterials.set(source, material);
                            }
                            mesh.material = material;
                        }
                    }
                });
                cluster.addChild(entity);
            }
        }
        applyMode();
    };
    const ready = Promise.all(assetIds.map(async id => [id, await assets.load(`/site-definition/landscape/3d/${id}.glb`)] as const))
        .then(loaded => { if (!disposed) { models = new Map(loaded); rebuild(); } })
        .catch(error => { if (!disposed) console.warn('Landscape planting could not load', error); });
    return {
        ready,
        updateLayout(value: Layout) { layout = structuredClone(value); rebuild(); },
        setVisible(value: boolean) { root.enabled = value; },
        setHedgeVisible(value: boolean) {
            if (hedgeVisible === value) return;
            hedgeVisible = value;
            app.off('update', animateHedge);
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                hedgeOpacity = value ? 1 : 0;
                animateHedge(0);
            } else {
                animateHedge(0);
                app.on('update', animateHedge);
            }
        },
        setWhiteMode(value: boolean) {
            whiteMode = value;
            app.off('update', animateTrees);
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) treeOpacity = value ? 0 : 1;
            animateTrees(0);
            if (treeOpacity !== (value ? 0 : 1)) app.on('update', animateTrees);
        },
        destroy() { app.off('update', animateTrees); app.off('update', animateHedge); disposed = true; root.destroy(); hedgeMaterial.destroy(); for (const material of boundaryMaterials.values()) material.destroy(); boundaryMaterials.clear(); for (const material of worldPlantMaterials.values()) material.destroy(); worldPlantMaterials.clear(); assets.destroy(); abort.abort(); }
    };
}
