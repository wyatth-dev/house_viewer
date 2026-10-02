import assert from 'node:assert/strict';
import test from 'node:test';

import { AppBase, AppOptions, Entity, NullGraphicsDevice, RenderComponentSystem } from 'playcanvas';

import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { solveVarenda } from '../src/products/parametric-engine/varenda/solution.ts';
import { createVarendaView } from '../src/products/varenda/view/varenda-view.ts';

test('fastener axes and selection bounds follow product root, hidden detail restores on clear', async () => {
    const canvas = {
        id: 'selection-test',
        width: 100,
        height: 100,
        addEventListener() {
            /* Headless canvas. */
        },
        removeEventListener() {
            /* Headless canvas. */
        }
    };
    const scene = new AppBase(canvas);
    const options = new AppOptions();
    options.graphicsDevice = new NullGraphicsDevice(canvas);
    options.componentSystems = [RenderComponentSystem];
    scene.init(options);
    const view = await createVarendaView(scene, {
        load: async () => ({ instantiateRenderEntity: () => new Entity() })
    });
    const solution = solveVarenda(defaultVarendaParams);
    view.update(solution);
    const screw = solution.endCaps.fasteners[0];
    const local = view.select([screw.instanceId]);
    assert.ok(local && local.max.x > local.min.x);
    view.root.setPosition(100, 200, 300);
    const world = view.select([screw.instanceId]);
    assert.ok(Math.abs(world.min.x - local.min.x - 100) < 1e-8);
    assert.ok(Math.abs(world.min.y - local.min.y - 200) < 1e-8);
    const gasket = solution.glazing.gaskets.find((g) => !g.renderOwnerInstanceId);
    view.select([gasket.instanceId]);
    assert.equal(view.root.findByName(gasket.instanceId).enabled, true);
    view.setGlazingDetailVisible(false);
    assert.equal(view.root.findByName(gasket.instanceId).enabled, true);
    view.clearSelection();
    assert.equal(view.root.findByName(gasket.instanceId).enabled, false);
    view.update(solution);
    assert.equal(view.root.children.length, 1);
    assert.equal(view.select(['missing']), undefined);
    view.destroy();
    scene.destroy();
});

test('selection clones shared materials and clearing restores exact original references', async () => {
    const { createSelectionMaterials } = await import('../src/products/varenda/view/selection.ts');
    const { StandardMaterial } = await import('playcanvas');
    const canvas = {
        id: 'material-test',
        width: 100,
        height: 100,
        addEventListener() {
            /* Headless. */
        },
        removeEventListener() {
            /* Headless. */
        }
    };
    const scene = new AppBase(canvas),
        options = new AppOptions();
    options.graphicsDevice = new NullGraphicsDevice(canvas);
    options.componentSystems = [RenderComponentSystem];
    scene.init(options);
    const original = new StandardMaterial();
    original.opacity = 0.7;
    const first = new Entity('first'),
        second = new Entity('second');
    scene.root.addChild(first);
    scene.root.addChild(second);
    first.addComponent('render', { type: 'box' });
    second.addComponent('render', { type: 'box' });
    const a = first.render.meshInstances[0],
        b = second.render.meshInstances[0];
    a.material = original;
    b.material = original;
    const selection = createSelectionMaterials();
    selection.apply(scene.root, new Set([a]));
    assert.notEqual(a.material, original);
    assert.notEqual(b.material, original);
    assert.equal(original.opacity, 0.7);
    assert.equal(b.material.opacity, 0.12);
    assert.ok(a.material.opacity >= 0.85);
    selection.clear();
    assert.equal(a.material, original);
    assert.equal(b.material, original);
    selection.apply(scene.root, new Set([b]));
    selection.clear();
    assert.equal(a.material, original);
    assert.equal(b.material, original);
    scene.destroy();
    original.destroy();
});

test('moving metal profiles and embedded gaskets have exclusive selection targets', async () => {
    const canvas = { id: 'rail-test', width: 100, height: 100, addEventListener() { /* Headless canvas. */ }, removeEventListener() { /* Headless canvas. */ } };
    const scene = new AppBase(canvas),
        options = new AppOptions();
    options.graphicsDevice = new NullGraphicsDevice(canvas);
    options.componentSystems = [RenderComponentSystem];
    scene.init(options);
    const view = await createVarendaView(scene, {
        load: async (url) => ({
            instantiateRenderEntity() {
                const root = new Entity();
                const names = url.endsWith('wallpiece-moving.glb')
                    ? [
                          '5110010035 - Veranda Wallplate Swivel v2',
                          'Glazing Seal Gasket',
                          'Glazing Support Gasket',
                          'Wallplate Top Seal Gasket'
                      ]
                    : url.endsWith('gutter-moving.glb')
                      ? ['5110010015 - Veranda Ring beam Swivel v2', 'Glazing Seal Gasket']
                      : [];
                for (const name of names) {
                    const child = new Entity(name);
                    root.addChild(child);
                    child.addComponent('render', { type: 'box' });
                }
                return root;
            }
        })
    });
    const solution = solveVarenda(defaultVarendaParams);
    view.update(solution);
    for (const [id, ownerName, metalName, ownerId] of [
        ['wallpiece-moving', 'Wall Piece moving', '5110010035 - Veranda Wallplate Swivel v2', 'wallpiece'],
        ['gutter-moving', 'Gutter moving', '5110010015 - Veranda Ring beam Swivel v2', 'gutter']
    ]) {
        const owner = view.root.findByName(ownerName);
        const metal = owner.findByName(metalName).render.meshInstances[0];
        const seal = owner.findByName('Glazing Seal Gasket').render.meshInstances[0];
        view.select([id]);
        assert.ok(metal.material.opacity >= 0.85);
        assert.equal(seal.material.opacity, 0.12);
        const gasket = solution.glazing.gaskets.find((g) => g.renderOwnerInstanceId === ownerId && g.role === 'seal');
        assert.ok(gasket);
        view.select([gasket.instanceId]);
        assert.equal(metal.material.opacity, 0.12);
        assert.ok(seal.material.opacity >= 0.85);
    }
    view.destroy();
    scene.destroy();
});
