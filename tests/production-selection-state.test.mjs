import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileSelection } from '../src/customization/selection-state.ts';

test('selection resolves fresh instances and clears rows removed by parameter edits', () => {
    const fresh = { id: 'bolt', instanceIds: ['new-1', 'new-2'], quantity: 2 };
    assert.equal(reconcileSelection([fresh], 'bolt'), fresh);
    assert.equal(reconcileSelection([fresh], 'old-glass-cut'), undefined);
    assert.equal(reconcileSelection([fresh]), undefined);
});

test('parent navigation follows the actual selection path and avoids cycles', async () => {
    const { navigateInstance } = await import('../src/customization/selection-state.ts');
    const first = navigateInstance(undefined, 'rafter-2', 'direct');
    const plate = navigateInstance(first, 'plate-2', 'related');
    const screw = navigateInstance(plate, 'screw-2', 'related');
    assert.deepEqual(navigateInstance(screw, 'plate-2', 'parent'), plate);
    assert.deepEqual(navigateInstance(screw, 'rafter-2', 'related'), first);
    assert.deepEqual(navigateInstance(screw, 'column-1', 'direct'), { id: 'column-1', path: ['column-1'] });
});

test('expanding or focusing another component preserves every already open menu', async () => {
    const { expandMenu } = await import('../src/customization/selection-state.ts');
    const menus = new Map();
    expandMenu(menus, 'wall-piece', 'wallpiece-moving');
    expandMenu(menus, 'wall-piece', 'gasket-1');
    expandMenu(menus, 'rafter', 'rafter-2');
    expandMenu(menus, 'rafter', 'plate-2');
    assert.deepEqual([...menus.get('wall-piece')], ['wallpiece-moving', 'gasket-1']);
    assert.deepEqual([...menus.get('rafter')], ['rafter-2', 'plate-2']);
});

test('group clicks toggle closed and switching groups closes the previous group', async () => {
    const { toggleGroup } = await import('../src/customization/selection-state.ts');
    const menus = new Map();
    toggleGroup(menus, 'plate');
    assert.equal(menus.has('plate'), true);
    toggleGroup(menus, 'plate');
    assert.equal(menus.size, 0);
    toggleGroup(menus, 'plate');
    toggleGroup(menus, 'post');
    assert.deepEqual([...menus.keys()], ['post']);
});

test('rendering context is the immediate navigation parent, including different paths to a shared screw', async () => {
    const { selectionContext } = await import('../src/customization/selection-state.ts');
    assert.deepEqual(selectionContext({ id: 'screw-1', path: ['column-1', 'screw-1'] }, ['column-1', 'column-2']), [
        'column-1'
    ]);
    assert.deepEqual(
        selectionContext({ id: 'screw-1', path: ['footplate-1', 'screw-1'] }, ['footplate-1', 'footplate-2']),
        ['footplate-1']
    );
    assert.deepEqual(selectionContext({ id: 'bolt-1', path: ['rafter-1', 'plate-1', 'bolt-1'] }, ['rafter-1']), [
        'plate-1'
    ]);
    assert.deepEqual(selectionContext({ id: 'column-1', path: ['column-1'] }, ['column-1', 'column-2']), [
        'column-1',
        'column-2'
    ]);
    assert.deepEqual(selectionContext(undefined, ['column-1']), []);
});

test('every screw selected from a Footplate menu keeps that Footplate as its parent', async () => {
    const { navigateInstance, selectionContext } = await import('../src/customization/selection-state.ts');
    let selected = navigateInstance(undefined, 'footplate-1', 'direct');
    for (const id of ['screw-1', 'screw-2', 'screw-3', 'screw-1']) {
        selected = navigateInstance(selected, id, 'related', 'footplate-1');
        assert.deepEqual(selected.path, ['footplate-1', id]);
        assert.deepEqual(selectionContext(selected, ['footplate-1', 'footplate-2']), ['footplate-1']);
    }
    const post = navigateInstance(undefined, 'post-1', 'direct');
    const foot = navigateInstance(post, 'footplate-1', 'related', 'post-1');
    const screw = navigateInstance(foot, 'screw-1', 'related', 'footplate-1');
    assert.deepEqual(screw.path, ['post-1', 'footplate-1', 'screw-1']);
    assert.deepEqual(selectionContext(screw, []), ['footplate-1']);
});

test('clicking a selected part returns to its parent, or its group for a root instance', async () => {
    const { toggleInstance } = await import('../src/customization/selection-state.ts');
    const foot = toggleInstance(undefined, 'foot-1', 'direct');
    const screw = toggleInstance(foot, 'screw-1', 'related', 'foot-1');
    assert.deepEqual(toggleInstance(screw, 'screw-1', 'related', 'foot-1'), foot);
    assert.equal(toggleInstance(foot, 'foot-1', 'direct'), undefined);
    assert.deepEqual(toggleInstance(screw, 'screw-2', 'related', 'foot-1').path, ['foot-1', 'screw-2']);
});
