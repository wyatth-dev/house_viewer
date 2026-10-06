import { BLEND_NORMAL, Entity, StandardMaterial } from 'playcanvas';
import type { AppBase, Material, MeshInstance } from 'playcanvas';

/** Fade one model at a time so coincident replacement meshes never overlap. */
export function fadeHouseModel(app: AppBase, model: Entity, from: number, to: number, signal: AbortSignal) {
    const entries: { mesh: MeshInstance; original: Material; material: StandardMaterial; opacity: number }[] = [];
    model.forEach((node) => {
        if (!(node instanceof Entity) || !node.render) return;
        for (const mesh of node.render.meshInstances) {
            if (!(mesh.material instanceof StandardMaterial)) continue;
            const original = mesh.material;
            const material = original.clone();
            material.blendType = BLEND_NORMAL;
            material.depthWrite = false;
            entries.push({ mesh, original, material, opacity: original.opacity });
            mesh.material = material;
        }
    });
    const apply = (amount: number) => {
        for (const entry of entries) {
            entry.material.opacity = entry.opacity * amount;
            entry.material.update();
        }
    };
    apply(from);
    return new Promise<void>((resolve) => {
        let elapsed = 0;
        const finish = () => {
            app.off('update', update);
            signal.removeEventListener('abort', finish);
            for (const { mesh, original, material } of entries) {
                mesh.material = original;
                material.destroy();
            }
            resolve();
        };
        const update = (dt: number) => {
            elapsed += dt;
            const t = Math.min(elapsed / 0.16, 1);
            const eased = t * t * (3 - 2 * t);
            apply(from + (to - from) * eased);
            if (t === 1) finish();
        };
        if (signal.aborted) finish();
        else {
            signal.addEventListener('abort', finish, { once: true });
            app.on('update', update);
        }
    });
}
