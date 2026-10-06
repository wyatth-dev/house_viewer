import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateLayout, defaults } from '../src/site-definition/layout.ts';
import { generateHedges, generatePlanting } from '../src/site-definition/rendering/planting.ts';

test('random groups contain varied trees and green/brown shrubs outside the property with an open front', () => {
    const layout = calculateLayout({ width: 20000, depth: 14000 }, defaults);
    const groups = generatePlanting(layout);
    assert.deepEqual(groups, generatePlanting(layout));
    assert.notDeepEqual(groups, generatePlanting(layout, 123));
    assert.ok(groups.length >= 3);
    const plants = groups.flat();
    for (const group of groups) {
        assert.ok(group.some(plant => !plant.asset.startsWith('shrub')));
        if (group.length > 2) assert.ok(group.some(plant => plant.asset.startsWith('shrub')));
        assert.ok(new Set(group.map(plant => plant.scale)).size > 1);
    }
    assert.ok(plants.some(plant => plant.asset === 'shrub-brown'));
    assert.ok(plants.some(plant => plant.asset === 'shrub-cluster'));
    assert.ok(plants.some(plant => plant.x < layout.property.minX - 20000 || plant.x > layout.property.maxX + 20000 || plant.z < layout.property.minZ - 20000));
    for (const plant of plants) {
        const p = layout.property;
        assert.ok(plant.x < p.minX || plant.x > p.maxX || plant.z < p.minZ);
        assert.ok(!(plant.x >= p.minX && plant.x <= p.maxX && plant.z >= layout.regions.front.minZ));
        assert.ok(plant.x >= p.minX - 50000 && plant.x <= p.maxX + 50000);
        assert.ok(plant.z >= p.minZ - 50000 && plant.z <= p.maxZ + 50000);
        assert.ok(plant.scale >= 0.5 && plant.scale <= 1.4);
    }
});


test('distance weighting keeps nearby groups denser while retaining distant groups', () => {
    const layout = calculateLayout({ width: 20000, depth: 14000 }, defaults);
    const p = layout.property;
    const distances = [];
    for (let seed = 1; seed <= 20; seed++) {
        for (const group of generatePlanting(layout, seed)) {
            const x = group.reduce((sum, plant) => sum + plant.x, 0) / group.length;
            const z = group.reduce((sum, plant) => sum + plant.z, 0) / group.length;
            distances.push(Math.hypot(Math.max(p.minX - x, 0, x - p.maxX), Math.max(p.minZ - z, 0, z - p.maxZ)));
        }
    }
    assert.ok(distances.reduce((sum, value) => sum + value, 0) / distances.length < 25000);
    assert.ok(distances.some(distance => distance > 35000));
    assert.ok(distances.filter(distance => distance < 22000).length > distances.filter(distance => distance > 30000).length);
});


test('boundary enclosure uses continuous rows of green and brown shrub models with an open front', () => {
    const layout = calculateLayout({ width: 20000, depth: 14000 }, defaults);
    const shrubs = generateHedges(layout);
    assert.deepEqual([...new Set(shrubs.map(shrub => shrub.side))], ['back', 'left', 'right']);
    assert.ok(shrubs.every(shrub => shrub.asset.startsWith('shrub')));
    assert.ok(shrubs.some(shrub => shrub.asset === 'shrub-brown'));
    assert.ok(new Set(shrubs.map(shrub => shrub.scale)).size > 1);
    assert.ok(shrubs.every(shrub => shrub.scale >= 0.75 && shrub.scale <= 1));
    for (const side of ['back', 'left', 'right']) {
        const row = shrubs.filter(shrub => shrub.side === side);
        for (let index = 1; index < row.length; index++)
            assert.ok(Math.hypot(row[index].x - row[index - 1].x, row[index].z - row[index - 1].z) <= 1500.001);
    }
    const p = layout.property;
    assert.ok(shrubs.every(shrub => shrub.x < p.minX || shrub.x > p.maxX || shrub.z < p.minZ));
    assert.equal(generatePlanting(layout).at(-1).length, 2);
});
