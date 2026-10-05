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
