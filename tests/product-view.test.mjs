import assert from 'node:assert/strict';
import test from 'node:test';

import { Entity, Vec3 } from 'playcanvas';

import { roofJointDatums } from '../src/parametric-engine/varenda/datums.ts';
import { defaultVarendaParams } from '../src/parametric-engine/varenda/parameters.ts';
import { solveRoofSlope } from '../src/parametric-engine/varenda/varenda-solver.ts';
import { createProductAssetStore, loadContainer } from '../src/product-view/assets.ts';
import { createVarendaView } from '../src/product-view/varenda-view.ts';

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
    const pending = loadContainer({ loadFromUrl() { /* Intentionally pending until cancellation. */ } }, 'post.glb', abort.signal);
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
            const gutter = { positionMm: { x: params.widthMm / 2, y: -params.depthMm, z: params.undersideHeightMm }, lengthMm: params.widthMm };
            const wallPiece = { positionMm: { x: params.widthMm / 2, y: 0, z: params.wallHeightMm }, lengthMm: params.widthMm };
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
                const expectedHinge = new Vec3(layout.positionMm.x, layout.positionMm.z + pivot.z, -(layout.positionMm.y + pivot.y));
                const sourceHinge = new Vec3(0, pivot.z, -pivot.y);
                const worldHinge = moving.getWorldTransform().transformPoint(sourceHinge);
                close(worldHinge.distance(expectedHinge), 0);
                close(fixed.getEulerAngles().length(), 0);
                const expectedDirection = new Vec3(0, Math.sin(roofSlope.slopeRadians), -Math.cos(roofSlope.slopeRadians));
                const direction = moving.getWorldTransform().transformVector(new Vec3(0, 0, -1)).normalize();
                close(direction.distance(expectedDirection), 0, 0.000001);
                close(moving.getLocalScale().x, params.widthMm / 100);
                close(moving.getLocalScale().y, 1);
                close(moving.getLocalScale().z, 1);
                contacts.push(moving.getWorldTransform().transformPoint(new Vec3(0, pivot.z + datum.bearingNormalOffsetMm, -pivot.y)));
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
