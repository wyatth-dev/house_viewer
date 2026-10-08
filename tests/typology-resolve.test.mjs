import assert from 'node:assert/strict';
import test from 'node:test';

const row = { id: 'house-001', projectId: 'house-001', name: 'Photo house', buildVersion: 2,
    baseUrl: '/data/projects/p-0001/typologies/house-001/', preview: 'preview.png' };

function stubFetch(handler) {
    const saved = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => { calls.push(String(url)); return handler(String(url), init); };
    return { calls, restore: () => { globalThis.fetch = saved; } };
}
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('listTypologies maps the legacy row projectId to photoModelId and tags the user project', async () => {
    const { listTypologies } = await import('../src/typology/catalog.ts');
    const fetch = stubFetch(() => json({ ok: true, result: { typologies: [row] } }));
    try {
        const photo = (await listTypologies('p-0001')).find(({ source }) => source === 'photo');
        assert.equal(fetch.calls[0], '/api/projects/p-0001/typologies');
        assert.equal(photo.projectId, 'p-0001');
        assert.equal(photo.photoModelId, 'house-001');
        assert.equal(photo.previewUrl, `${row.baseUrl}preview.png?v=2`);
        const presets = await listTypologies(null);
        assert.equal(fetch.calls.length, 1, 'no project: presets only, no request');
        assert.ok(presets.every(({ source }) => source === 'builtin'));
    } finally {
        fetch.restore();
    }
});

test('resolveTypology falls back to Fairy when the photo typology is missing', async () => {
    const { resolveTypology } = await import('../src/typology/catalog.ts');
    const { activeTypology } = await import('../src/typology/index.ts');
    const fetch = stubFetch(() => json({ ok: true, result: { typologies: [] } }));
    const warn = console.warn;
    console.warn = () => undefined; // the fallback logs a warning; keep test output clean
    try {
        const resolved = await resolveTypology({ source: 'photo', typologyId: 'house-009' }, 'p-0001');
        assert.equal(resolved.fellBack, true);
        assert.equal(resolved.entry.id, 'fairy-house');
        assert.equal(activeTypology().id, 'fairy-house');
        const preset = await resolveTypology({ source: 'preset', typologyId: 'fairy-house' }, 'p-0001');
        assert.equal(preset.fellBack, false);
    } finally {
        console.warn = warn;
        fetch.restore();
    }
});

async function withQuietWarn(run) {
    const warn = console.warn;
    console.warn = () => undefined; // the fallback logs a warning; keep test output clean
    try { return await run(); } finally { console.warn = warn; }
}

test('resolveTypology rejects when the typology list request fails (500) and does not fall back', async () => {
    const { resolveTypology } = await import('../src/typology/catalog.ts');
    const fetch = stubFetch(() => json({ ok: false }, 500));
    try {
        await withQuietWarn(() => assert.rejects(resolveTypology({ source: 'photo', typologyId: 'house-001' }, 'p-0001')));
    } finally {
        fetch.restore();
    }
});

test('resolveTypology rejects when the typology list request has a network error', async () => {
    const { resolveTypology } = await import('../src/typology/catalog.ts');
    const fetch = stubFetch(() => { throw new TypeError('Failed to fetch'); });
    try {
        await withQuietWarn(() => assert.rejects(resolveTypology({ source: 'photo', typologyId: 'house-001' }, 'p-0001'), TypeError));
    } finally {
        fetch.restore();
    }
});

test('resolveTypology rejects when the list is ok but scene.json answers 500', async () => {
    const { resolveTypology } = await import('../src/typology/catalog.ts');
    const fetch = stubFetch((url) => url.endsWith('scene.json')
        ? json({}, 500)
        : json({ ok: true, result: { typologies: [row] } }));
    try {
        await withQuietWarn(() => assert.rejects(resolveTypology({ source: 'photo', typologyId: 'house-001' }, 'p-0001')));
    } finally {
        fetch.restore();
    }
});

test('resolveTypology falls back when the list is ok and scene.json answers 404', async () => {
    const { resolveTypology } = await import('../src/typology/catalog.ts');
    const fetch = stubFetch((url) => url.endsWith('scene.json')
        ? json({}, 404)
        : json({ ok: true, result: { typologies: [row] } }));
    try {
        const resolved = await withQuietWarn(() => resolveTypology({ source: 'photo', typologyId: 'house-001' }, 'p-0001'));
        assert.equal(resolved.fellBack, true);
        assert.equal(resolved.entry.id, 'fairy-house');
    } finally {
        fetch.restore();
    }
});

test('resolveTypology falls back for a preset id that is not a known preset', async () => {
    const { resolveTypology } = await import('../src/typology/catalog.ts');
    const fetch = stubFetch(() => json({}, 500));
    try {
        const resolved = await withQuietWarn(() => resolveTypology({ source: 'preset', typologyId: 'no-such-preset' }, 'p-0001'));
        assert.equal(resolved.fellBack, true);
        assert.equal(resolved.entry.id, 'fairy-house');
        assert.equal(fetch.calls.length, 0, 'preset ids are resolved without the service');
    } finally {
        fetch.restore();
    }
});

test('resolveTypology rejects when the typology list response cannot be parsed', async () => {
    const { resolveTypology } = await import('../src/typology/catalog.ts');
    const fetch = stubFetch(() => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }));
    try {
        await withQuietWarn(() => assert.rejects(resolveTypology({ source: 'photo', typologyId: 'house-001' }, 'p-0001')));
    } finally {
        fetch.restore();
    }
});
