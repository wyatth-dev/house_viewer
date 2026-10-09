import assert from 'node:assert/strict';
import test from 'node:test';

const refs = await import('../src/rendering/references.ts');

function doc(house = { source: 'photo', typologyId: 'house-001' }, media = { renders: [], references: [] }) {
    return { schemaVersion: 1, id: 'p-0001', name: 'P', revision: 0, createdAt: '', updatedAt: '', house,
        site: { dimensionsMm: { front: 1, back: 1, left: 1, right: 1 } },
        display: { representation: 'render', trees: true, fence: false, dimensions: true }, products: [], media };
}
const photo = { url: '/files/p-0001/house-001/photos/a.jpg', name: 'House' };

test('house photo seeds Context once and a deletion sticks', () => {
    let d = doc();
    assert.equal(refs.needsContextSeed(d), true);
    d = refs.seedContext(d, photo);
    assert.deepEqual(refs.contextPhotos(d), [{ kind: 'context', url: photo.url, name: 'House', origin: 'house-photo' }]);
    assert.equal(refs.needsContextSeed(d), false);
    d = refs.removeContext(d, photo.url);
    assert.deepEqual(refs.contextPhotos(d), []);
    assert.equal(refs.seedContext(d, photo), d, 'deleted house photo is not added back');
    assert.deepEqual(d.house, { source: 'photo', typologyId: 'house-001' }, 'house choice is untouched');
});

test('choosing another photo house replaces the seeded photo but keeps uploads', () => {
    let d = refs.seedContext(doc(), photo);
    d = refs.addContext(d, [{ url: '/data/projects/p-0001/media/context/x.jpg', name: 'garden.jpg' }]);
    d = { ...d, house: { source: 'photo', typologyId: 'house-002' } };
    assert.equal(refs.needsContextSeed(d), true);
    const other = { url: '/files/p-0001/house-002/photos/b.jpg', name: 'Other' };
    d = refs.seedContext(d, other);
    assert.deepEqual(refs.contextPhotos(d).map(item => [item.url, item.origin]), [
        ['/data/projects/p-0001/media/context/x.jpg', 'upload'], [other.url, 'house-photo']
    ]);
});

test('preset houses have no house photo to seed', () => {
    const d = doc({ source: 'preset', typologyId: 'fairy-house' });
    assert.equal(refs.needsContextSeed(d), false);
    assert.equal(refs.seedContext(d, photo), d);
});

test('addContext ignores duplicates', () => {
    const item = { url: '/data/projects/p-0001/media/context/x.jpg', name: 'x' };
    const d = refs.addContext(refs.addContext(doc(), [item]), [item]);
    assert.equal(refs.contextPhotos(d).length, 1);
});

test('captures and one render job per capture', () => {
    let d = refs.addCapture(doc(), { url: 'data:image/jpeg;base64,AAA' });
    d = refs.storeJob(d, { id: 'r-1', sourceUrl: 'data:image/jpeg;base64,AAA', mode: 'model', referencePhotoUrls: [], status: 'failed' });
    d = refs.replaceCaptureUrl(d, 'data:image/jpeg;base64,AAA', '/data/projects/p-0001/media/captures/c.jpg');
    const url = '/data/projects/p-0001/media/captures/c.jpg';
    assert.deepEqual(refs.captures(d).map(c => c.url), [url]);
    assert.equal(refs.jobFor(d, url).id, 'r-1');
    d = refs.storeJob(d, { id: 'r-2', sourceUrl: url, mode: 'model', referencePhotoUrls: [], status: 'queued' });
    assert.deepEqual(refs.renderJobs(d).map(job => job.id), ['r-2']);
    d = refs.removeCapture(d, url);
    assert.deepEqual(refs.captures(d), []);
    assert.deepEqual(refs.renderJobs(d), []);
});

test('legacy jobs without a service read as not rendered', () => {
    const d = doc(undefined, { references: [], renders: [{ id: 'x', sourceUrl: 'u', status: 'awaiting-integration', mode: 'model' }] });
    assert.equal(refs.renderJobs(d)[0].status, 'failed');
});

test('render settings fall back to defaults and keep one stored record', () => {
    const groups = [
        { id: 'style', label: 'Style', default: 'commercial', options: [{ id: 'commercial', label: 'Commercial' }, { id: 'photo', label: 'Photo' }] },
        { id: 'weather', label: 'Weather', default: 'clear', options: [{ id: 'clear', label: 'Clear' }, { id: 'overcast', label: 'Overcast' }] }
    ];
    let d = doc();
    assert.deepEqual(refs.renderSettings(d, groups), { style: 'commercial', weather: 'clear' });
    d = refs.setRenderSetting(d, 'weather', 'overcast');
    d = refs.setRenderSetting(d, 'style', 'photo');
    assert.deepEqual(refs.renderSettings(d, groups), { style: 'photo', weather: 'overcast' });
    assert.equal(d.media.references.filter(item => item.kind === 'render-options').length, 1);
    d = refs.setRenderSetting(d, 'style', 'removed-option');
    assert.equal(refs.renderSettings(d, groups).style, 'commercial', 'an option removed from options.toml falls back to the default');
});
