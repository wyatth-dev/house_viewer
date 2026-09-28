import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { mapRoles, parseMaterialManifest } from '../src/materials/manifest.ts';

const root = new URL('../public/materials/', import.meta.url);
for (const directory of await readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const base = new URL(`${directory.name}/`, root);
    const manifest = parseMaterialManifest(JSON.parse(await readFile(new URL('material.json', base), 'utf8')));
    for (const [profile, settings] of Object.entries(manifest.profiles)) {
        for (const role of mapRoles) {
            const map = settings.maps[role];
            const path = new URL(map.file, base);
            const bytes = await readFile(path);
            if (bytes.length !== map.bytes || createHash('sha256').update(bytes).digest('hex') !== map.sha256)
                throw new Error(`Texture integrity mismatch: ${fileURLToPath(path)}`);
        }
        console.log(
            `${manifest.id}/${profile}: verified 3 maps, ${(settings.downloadBytes / 1048576).toFixed(2)} MiB download, ~${settings.estimatedGpuBytes / 1048576} MiB GPU`
        );
    }
}
