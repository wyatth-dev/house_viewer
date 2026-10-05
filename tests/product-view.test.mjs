import assert from 'node:assert/strict';
import test from 'node:test';

import { Entity, Vec3 } from 'playcanvas';

import { roofJointDatums } from '../src/products/parametric-engine/varenda/datums.ts';
import { defaultVarendaParams } from '../src/products/parametric-engine/varenda/parameters.ts';
import { solveRoofSlope } from '../src/products/parametric-engine/varenda/varenda-solver.ts';
import { createVarendaView } from '../src/products/varenda/view/varenda-view.ts';
import { createProductAssetStore, loadContainer } from '../src/shared/assets/containers.ts';

test('asset store shares loads and releases once after disposal', async () => {
    let loads = 0,
        unloads = 0,
        removes = 0;
    const resource = {};
    const app = {
        assets: {
            loadFromUrl(url, type, done) {
                loads++;
                done(null, {
                    resource,
                    unload() {
                        unloads++;
                    }
                });
            },
            remove() {
                removes++;
            }
        }
    };
    const store = createProductAssetStore(app, new AbortController().signal);
    assert.equal(await store.load('profile.glb'), resource);
    assert.equal(await store.load('profile.glb'), resource);
    assert.equal(loads, 1);
    store.destroy();
    store.destroy();
    assert.equal(unloads, 1);
    assert.equal(removes, 1);
    await assert.rejects(store.load('other.glb'), { name: 'AbortError' });
});

test('container errors identify requested asset and cancellation rejects promptly', async () => {
    await assert.rejects(
        loadContainer(
            {
                loadFromUrl(u, t, cb) {
                    cb('missing');
                }
            },
            'gutter.glb',
            new AbortController().signal
        ),
        /gutter.glb/
    );
    const abort = new AbortController();
    const pending = loadContainer(
        {
            loadFromUrl() {
                /* Intentionally pending until cancellation. */
            }
        },
        'post.glb',
        abort.signal
    );
    abort.abort();
    await assert.rejects(pending, { name: 'AbortError' });
});

test('product view keeps local geometry and independent roots without accumulating parts', async () => {
    const app = { root: new Entity('scene') };
    const resources = { load: async () => ({ instantiateRenderEntity: () => new Entity('mesh') }) };
    const first = await createVarendaView(app, resources);
    const second = await createVarendaView(app, resources);
    const solution = {
        footings: { assemblies: [{ instanceId: 'foot-1', positionMm: { x: 100, y: -2000, z: 0 } }] },
        posts: [{ instanceId: 'post-1', positionMm: { x: 100, y: -2000, z: 5 }, lengthMm: 1595 }],
        gutter: { positionMm: { x: 2000, y: -2000, z: 1600 }, lengthMm: 4000 },
        wallPiece: { positionMm: { x: 2000, y: 0, z: 2500 }, lengthMm: 4000 },
        roofSlope: { slopeDegrees: 0 }
    };
    first.update(solution);
    first.update(solution);
    second.update(solution);
    assert.equal(first.root.children.length, 1);
    const parts = first.root.children[0].children;
    assert.equal(parts.length, 6);
    assert.deepEqual(parts[1].getLocalPosition().toArray(), [100, 5, 2000]);
    assert.equal(parts[1].getLocalScale().y, 1595 / 95);
    for (const gutter of [first.root.findByName('Gutter fixed'), first.root.findByName('Gutter moving')]) {
        assert.deepEqual(gutter.getPosition().toArray(), [2000, 1600, 2000]);
        assert.deepEqual(gutter.getLocalScale().toArray(), [40, 1, 1]);
    }
    first.destroy();
    first.destroy();
    assert.equal(second.root.children[0].children.length, 6);
    second.destroy();
    app.root.destroy();
});

test('moving rails rotate about stationary hinges and share one bearing plane', async () => {
    const app = { root: new Entity('scene') };
    const resources = { load: async () => ({ instantiateRenderEntity: () => new Entity('mesh') }) };
    const view = await createVarendaView(app, resources);
    const close = (actual, expected, tolerance = 0.001) => {
        assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
    };
    try {
        for (const changes of [{}, { wallHeightMm: 2200 }, { depthMm: 3000, widthMm: 5000 }]) {
            const params = { ...defaultVarendaParams, ...changes };
            const roofSlope = solveRoofSlope(params);
            const gutter = {
                positionMm: { x: params.widthMm / 2, y: -params.depthMm + 75, z: params.undersideHeightMm },
                lengthMm: params.widthMm
            };
            const wallPiece = {
                positionMm: { x: params.widthMm / 2, y: 0, z: params.wallHeightMm },
                lengthMm: params.widthMm
            };
            view.update({ footings: { assemblies: [] }, posts: [], gutter, wallPiece, roofSlope });
            const parts = view.root.children[0];
            const contacts = [];
            for (const [name, layout, datum] of [
                ['Gutter', gutter, roofJointDatums.gutter],
                ['Wall Piece', wallPiece, roofJointDatums.wallPiece]
            ]) {
                const fixed = parts.findByName(`${name} fixed`);
                const moving = parts.findByName(`${name} moving`);
                const pivot = datum.pivotMm;
                const expectedHinge = new Vec3(
                    layout.positionMm.x,
                    layout.positionMm.z + pivot.z,
                    -(layout.positionMm.y + pivot.y)
                );
                const sourceHinge = new Vec3(0, pivot.z, -pivot.y);
                const worldHinge = moving.getWorldTransform().transformPoint(sourceHinge);
                close(worldHinge.distance(expectedHinge), 0);
                close(fixed.getEulerAngles().length(), 0);
                const expectedDirection = new Vec3(
                    0,
                    Math.sin(roofSlope.slopeRadians),
                    -Math.cos(roofSlope.slopeRadians)
                );
                const direction = moving
                    .getWorldTransform()
                    .transformVector(new Vec3(0, 0, -1))
                    .normalize();
                close(direction.distance(expectedDirection), 0, 0.000001);
                close(moving.getLocalScale().x, params.widthMm / 100);
                close(moving.getLocalScale().y, 1);
                close(moving.getLocalScale().z, 1);
                contacts.push(
                    moving
                        .getWorldTransform()
                        .transformPoint(new Vec3(0, pivot.z + datum.bearingNormalOffsetMm, -pivot.y))
                );
            }
            const normal = new Vec3(0, Math.cos(roofSlope.slopeRadians), Math.sin(roofSlope.slopeRadians));
            close(contacts[1].clone().sub(contacts[0]).dot(normal), 0);
            assert.equal(view.root.children.length, 1);
            assert.equal(parts.children.length, 4);
        }
    } finally {
        view.destroy();
        app.root.destroy();
    }
});

test('placed products show fastener axes only when detail editing is enabled', async () => {
    let draw;
    let count = 0;
    const scene = {
        root: new Entity('scene'),
        on: (_event, callback) => {
            draw = callback;
        },
        off() {
            /* Headless event cleanup. */
        },
        drawLine() {
            count++;
        }
    };
    const view = await createVarendaView(scene, {
        load: async () => ({ instantiateRenderEntity: () => new Entity('mesh') })
    });
    const { solveVarenda } = await import('../src/products/parametric-engine/varenda/solution.ts');
    view.update(solveVarenda(defaultVarendaParams));
    view.setFastenerAxesVisible(false);
    draw();
    assert.equal(count, 0);
    view.setFastenerAxesVisible(true);
    draw();
    assert.ok(count > 0);
    const previous = count;
    view.setFastenerAxesVisible(false);
    draw();
    assert.equal(count, previous);
    view.destroy();
    scene.root.destroy();
});

test('component perspective basis follows its world transform without inheriting stretch', async () => {
    const root = new Entity('Scene');
    const view = await createVarendaView({ root }, {
        load: async () => ({ instantiateRenderEntity: () => new Entity('Asset') })
    });
    try {
        const { solveVarenda } = await import('../src/products/parametric-engine/varenda/solution.ts');
        view.update(solveVarenda(defaultVarendaParams));
        view.root.setEulerAngles(0, 90, 0);
        view.root.setLocalScale(1, 1, -1);
        const foot = view.root.findByName('footing-column-1');
        assert.ok(foot);
        foot.setLocalEulerAngles(0, 30, 0);
        foot.setLocalScale(2, 3, 4);
        const basis = view.getViewBasis(foot.name);
        const expected = foot.getWorldTransform().transformVector(new Vec3(0, 0, 1)).normalize();
        assert.ok(new Vec3(basis.front.x, basis.front.y, basis.front.z).equalsApprox(expected));
        for (const axis of Object.values(basis)) assert.ok(Math.abs(Math.hypot(axis.x, axis.y, axis.z) - 1) < 1e-6);
        assert.deepEqual(view.getViewBasis('screw-axis', foot.name), basis);
        assert.notDeepEqual(basis, view.getViewBasis());
    } finally { view.destroy(); root.destroy(); }
});


test('selecting components highlights their installed screws without selecting siblings or parents', async () => {
    const { solveVarenda } = await import('../src/products/parametric-engine/varenda/solution.ts');
    const { getInstalledFasteners } = await import('../src/products/parametric-engine/varenda/production-list.ts');
    const solution = solveVarenda(defaultVarendaParams);
    const hardware = getInstalledFasteners(solution);
    let draw;
    const colors = [];
    const scene = {
        root: new Entity('scene'),
        on: (_event, callback) => { draw = callback; },
        off() { /* Headless event cleanup. */ },
        drawLine: (_a, _b, color) => colors.push(color)
    };
    const view = await createVarendaView(scene, {
        load: async () => ({ instantiateRenderEntity: () => new Entity('mesh') })
    });
    const highlighted = (id, context = []) => {
        view.select([id], context);
        colors.length = 0;
        draw();
        return hardware.filter((_part, i) => colors.at(-hardware.length + i).r === 1).map(part => part.instanceId);
    };
    try {
        view.update(solution);
        const cap = solution.endCaps.connections[0];
        assert.ok(highlighted(cap.endCapHoleRef.partInstanceId).includes(cap.fastenerInstanceId));
        const rafter = solution.rafters[0];
        const active = highlighted(rafter.instanceId);
        for (const stand of [rafter.stands.front, rafter.stands.rear])
            for (const screw of stand.fasteners) assert.ok(active.includes(screw.instanceId));
        for (const screw of solution.rafters[1].stands.front.fasteners)
            assert.equal(active.includes(screw.instanceId), false);
        assert.deepEqual(highlighted(cap.fastenerInstanceId, [cap.endCapHoleRef.partInstanceId]), [cap.fastenerInstanceId]);
    } finally { view.destroy(); scene.root.destroy(); }
});


test('rafter, end rafter and wall plate selections highlight their endcaps and screws', async () => {
    const { BoundingBox, StandardMaterial } = await import('playcanvas');
    const { solveVarenda } = await import('../src/products/parametric-engine/varenda/solution.ts');
    const solution = solveVarenda(defaultVarendaParams);
    const scene = { root: new Entity('scene') };
    const view = await createVarendaView(scene, {
        load: async () => ({ instantiateRenderEntity() {
            const entity = new Entity('mesh');
            entity.addChild(new Entity('5110010015 - Veranda Ring beam Swivel v2'));
            entity.addChild(new Entity('5110010035 - Veranda Wallplate Swivel v2'));
            Object.defineProperty(entity, 'render', { value: {
                meshInstances: [{ material: new StandardMaterial(), aabb: new BoundingBox() }]
            } });
            return entity;
        } })
    });
    try {
        view.update(solution);
        const caps = [...solution.rafterEndCaps.plates, ...solution.endCaps.plates];
        for (const cap of caps) {
            const owner = cap.rafterRef?.instanceId ?? `${cap.railRef.instanceId}-moving`;
            view.select([owner]);
            assert.equal(view.root.findByName(cap.instanceId).render.meshInstances[0].material.opacity, 1, owner);
            const unrelated = caps.find(part => (part.rafterRef?.instanceId ?? `${part.railRef.instanceId}-moving`) !== owner);
            assert.equal(view.root.findByName(unrelated.instanceId).render.meshInstances[0].material.opacity, 0.12);
        }
    } finally { view.destroy(); scene.root.destroy(); }
});
