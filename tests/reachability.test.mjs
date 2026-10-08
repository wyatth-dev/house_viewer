import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Guard against dead code: every file under src/ must be reachable through relative imports
// from the application entry or from a test. Data and declaration files are listed explicitly.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowed = ['src/site-definition/materials/sources/short-grass.json', 'src/vite-env.d.ts'];
const specifier = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function reachable(entries) {
    const seen = new Set();
    const pending = [...entries];
    while (pending.length) {
        const file = pending.pop();
        if (seen.has(file) || !existsSync(file)) continue;
        seen.add(file);
        if (!/\.(ts|mjs|js)$/.test(file)) continue;
        for (const match of readFileSync(file, 'utf8').matchAll(specifier)) {
            const target = match[1] ?? match[2] ?? match[3];
            if (target.startsWith('.')) pending.push(resolve(dirname(file), target));
        }
    }
    return seen;
}

function files(directory) {
    return readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? files(path) : [path];
    });
}

test('every src file is reachable from the app entry or a test', () => {
    const tests = readdirSync(join(root, 'tests'))
        .filter((name) => name.endsWith('.mjs') && name !== 'reachability.test.mjs')
        .map((name) => join(root, 'tests', name));
    const seen = reachable([join(root, 'src/main.ts'), ...tests]);
    const unreachable = files(join(root, 'src'))
        .filter((file) => !seen.has(file))
        .map((file) => relative(root, file));
    assert.deepEqual(unreachable.sort(), allowed);
});
