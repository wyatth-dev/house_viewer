import assert from 'node:assert/strict';
import test from 'node:test';
import { Entity, EventHandler, StandardMaterial } from 'playcanvas';
import { fadeHouseModel } from '../src/scene/house/fade.ts';

function fixture() {
    const app = new EventHandler();
    const model = new Entity('house');
    const material = new StandardMaterial();
    material.opacity = .8;
    const mesh = { material };
    model.render = { meshInstances: [mesh] };
    return { app, model, material, mesh };
}

test('fade uses temporary materials and restores shared source material', async () => {
    const { app, model, material, mesh } = fixture();
    const pending = fadeHouseModel(app, model, 0, 1, new AbortController().signal);
    assert.notEqual(mesh.material, material);
    assert.equal(mesh.material.opacity, 0);
    app.fire('update', .08);
    assert.equal(mesh.material.opacity, .4);
    assert.equal(material.opacity, .8);
    app.fire('update', .08);
    await pending;
    assert.equal(mesh.material, material);
    assert.equal(app.hasEvent('update'), false);
});

test('abort finishes transition and releases its frame listener', async () => {
    const { app, model, material, mesh } = fixture();
    const controller = new AbortController();
    const pending = fadeHouseModel(app, model, 1, 0, controller.signal);
    app.fire('update', .04);
    controller.abort();
    await pending;
    assert.equal(mesh.material, material);
    assert.equal(app.hasEvent('update'), false);
});
