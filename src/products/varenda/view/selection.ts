import { BLEND_NORMAL, Color, Entity, StandardMaterial } from 'playcanvas';
import type { Material, MeshInstance } from 'playcanvas';

import type { Bounds3 } from '../../../shared/geometry/types.ts';

export function meshTargets(entity: Entity): MeshInstance[] {
    const targets: MeshInstance[] = [];
    entity.forEach((node) => {
        if (node instanceof Entity && node.render) targets.push(...node.render.meshInstances);
    });
    return targets;
}
export function combineBounds(bounds: readonly Bounds3[]): Bounds3 | undefined {
    if (!bounds.length) return undefined;
    return {
        min: {
            x: Math.min(...bounds.map((b) => b.min.x)),
            y: Math.min(...bounds.map((b) => b.min.y)),
            z: Math.min(...bounds.map((b) => b.min.z))
        },
        max: {
            x: Math.max(...bounds.map((b) => b.max.x)),
            y: Math.max(...bounds.map((b) => b.max.y)),
            z: Math.max(...bounds.map((b) => b.max.z))
        }
    };
}
export function entityBounds(entity: Entity): Bounds3 {
    const boxes = meshTargets(entity).map((mesh) => {
        const min = mesh.aabb.getMin(),
            max = mesh.aabb.getMax();
        return { min: { x: min.x, y: min.y, z: min.z }, max: { x: max.x, y: max.y, z: max.z } };
    });
    const position = entity.getPosition();
    return (
        combineBounds(boxes) ?? {
            min: { x: position.x - 2, y: position.y - 2, z: position.z - 2 },
            max: { x: position.x + 2, y: position.y + 2, z: position.z + 2 }
        }
    );
}

/** Owns only temporary overrides, never the imported/shared materials. */
export function createSelectionMaterials() {
    const originals = new Map<MeshInstance, Material>();
    const owned = new Set<StandardMaterial>();
    const clear = () => {
        for (const [mesh, material] of originals) mesh.material = material;
        originals.clear();
        for (const material of owned) material.destroy();
        owned.clear();
    };
    return {
        clear,
        apply(root: Entity, selected: ReadonlySet<MeshInstance>) {
            clear();
            const cache = new Map<Material, Map<boolean, StandardMaterial>>();
            for (const mesh of meshTargets(root)) {
                const original = mesh.material;
                originals.set(mesh, original);
                const active = selected.has(mesh);
                const variants = cache.get(original) ?? new Map<boolean, StandardMaterial>();
                let material = variants.get(active);
                if (!material) {
                    material = original instanceof StandardMaterial ? original.clone() : new StandardMaterial();
                    material.blendType = BLEND_NORMAL;
                    material.opacity = active
                        ? Math.max(original instanceof StandardMaterial ? original.opacity : 1, 0.85)
                        : 0.12;
                    material.depthWrite = active;
                    if (active) {
                        material.diffuse = new Color(1, 0.63, 0.17);
                        material.emissive = new Color(0.3, 0.1, 0.01);
                    }
                    material.update();
                    owned.add(material);
                    variants.set(active, material);
                    cache.set(original, variants);
                }
                mesh.material = material;
            }
        }
    };
}
