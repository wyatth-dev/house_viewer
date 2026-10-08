import assert from 'node:assert/strict';
import test from 'node:test';

const { parseProject, ProjectFormatError } = await import('../src/projects/state.ts');

function doc() {
    return {
        schemaVersion: 1, id: 'p-0001', name: 'My house', revision: 3,
        createdAt: '2026-10-08T12:00:00', updatedAt: '2026-10-08T12:30:00',
        house: { source: 'preset', typologyId: 'fairy-house' },
        site: { dimensionsMm: { front: 5000, back: 7000, left: 2000, right: 2000 } },
        display: { representation: 'render', trees: true, fence: false, dimensions: true },
        products: [{
            instanceId: 'varenda-1', productType: 'varenda', name: 'Varenda 1',
            attachment: { wallFaceId: 'facade-main', alongWallOffsetMm: 1200 },
            params: { widthMm: 4000, depthMm: 2000, wallHeightMm: 2500, undersideHeightMm: 1800, postInterval: 1000, rafterInterval: 500 },
            lockedDimensions: [], lockedParameters: []
        }],
        media: { renders: [], references: [] }
    };
}

test('parseProject accepts a complete document', () => {
    assert.deepEqual(parseProject(doc()), doc());
});

test('parseProject names the bad field', () => {
    const bad = doc();
    bad.products[0].params.widthMm = 'x';
    assert.throws(() => parseProject(bad), (e) => {
        assert.ok(e instanceof ProjectFormatError);
        assert.match(e.message, /products\[0\]\.params\.widthMm/);
        return true;
    });
});

test('parseProject rejects unknown schemaVersion', () => {
    const bad = doc();
    bad.schemaVersion = 2;
    assert.throws(() => parseProject(bad), /schemaVersion/);
});
