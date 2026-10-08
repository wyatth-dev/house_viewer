#!/usr/bin/env node
/**
 * One command for the whole app: the Python modelling service + the Vite front end.
 *
 *   npm run dev     Vite dev server (hot reload) + Python service. Open the URL Vite prints.
 *   npm start       Build the front end once, then the Python service serves everything on one port.
 *
 * First run installs what is missing: npm packages (if node_modules is absent) and the
 * Python environment (`uv sync`, fast when already up to date). Ctrl+C stops both processes.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const service = 'services/facade-modeler';
const port = process.env.FACADE_HTTP_PORT ?? '8765';
const serveBuilt = process.argv.includes('--serve');
const env = { ...process.env, FACADE_HTTP_PORT: port };

function run(command, args, label) {
    const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
    if (result.error?.code === 'ENOENT') fail(`${command} was not found. ${hint(command)}`);
    if (result.status !== 0) fail(`${label} failed (exit code ${result.status}).`);
}

function hint(command) {
    return command === 'uv'
        ? 'Install uv (https://docs.astral.sh/uv/): brew install uv'
        : 'Install Node.js 22.23.2 or later.';
}

function fail(message) {
    console.error(`\n✖ ${message}`);
    process.exit(1);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!existsSync(new URL('../node_modules', import.meta.url))) run(npm, ['install'], 'npm install');
run('uv', ['sync', '--quiet', '--project', service], 'Python environment setup (uv sync)');
if (serveBuilt) run(npm, ['run', 'build'], 'Front-end build');

const children = [];
function start(label, command, args) {
    const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const prefix = `[${label}] `;
    for (const stream of [child.stdout, child.stderr]) {
        let rest = '';
        stream.on('data', (chunk) => {
            const lines = (rest + chunk).split('\n');
            rest = lines.pop();
            for (const line of lines) process.stdout.write(prefix + line + '\n');
        });
    }
    child.on('exit', (code) => {
        if (!stopping) {
            console.error(`\n✖ ${label} stopped (exit code ${code}). Stopping everything.`);
            stop(code ?? 1);
        }
    });
    children.push(child);
}

let stopping = false;
function stop(code = 0) {
    stopping = true;
    for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
    setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

start('service', 'uv', ['run', '--quiet', '--project', service, 'facade-modeler-http']);
if (serveBuilt) {
    console.log(`\nHouse viewer: http://127.0.0.1:${port}/   (photo intake: /intake.html)\n`);
} else {
    start('vite', process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))]);
}
