/**
 * Your projects: the home page shown at `/` (no `?project=`). Lists the user's projects as
 * cards, creates, renames and deletes them. Opening a card goes to `/?project=<id>`.
 * `?error=<message>` (set when a project could not be opened) is shown at the top.
 */
import { createProject, deleteProject, listProjects, renameProject } from './api.ts';
import type { ProjectRow } from './api.ts';

const OFFLINE = 'The project service is not running. Start it with npm run dev.';
const PLACEHOLDER = `<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M14 40 V22 L32 9 L50 22 V40 Z M26 40 V29 H38 V40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>`;

const enc = encodeURIComponent;
const projectUrl = (pid: string) => `/?project=${enc(pid)}`;

function previewUrl(row: ProjectRow): string {
    const { source, typologyId } = row.house;
    return source === 'preset'
        ? `/scenes/typology/${enc(typologyId)}/preview.png`
        : `/data/projects/${enc(row.id)}/typologies/${enc(typologyId)}/preview.png`;
}

function formatUpdated(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** The service is down (or the dev proxy cannot reach it): network failure or a 5xx without a reason. */
function isOffline(error: unknown): boolean {
    return error instanceof TypeError || /\(HTTP 5\d\d\)$/.test((error as Error)?.message ?? '');
}

export async function renderHome(host: HTMLElement): Promise<void> {
    document.title = 'House & Ground — Your projects';
    host.hidden = false;
    host.innerHTML = `
        <header class="home-header">
            <a class="brand" href="/">HOUSE <span>&</span> GROUND</a><span class="stage">SCENE BUILDER</span>
        </header>
        <div class="home-body">
            <div class="home-title">
                <h1>Your projects</h1>
            </div>
            <p class="home-message error" role="alert" hidden></p>
            <p class="home-message" role="status" aria-live="polite" hidden></p>
            <div class="home-grid" aria-label="Projects">
                <button type="button" class="home-new" aria-label="New project" disabled>
                    <span class="home-new-plus" aria-hidden="true">+</span>
                    <span>New project</span>
                </button>
            </div>
        </div>`;
    const errorLine = host.querySelector<HTMLElement>('.home-message.error')!;
    const statusLine = host.querySelector<HTMLElement>('.home-message[role="status"]')!;
    const grid = host.querySelector<HTMLElement>('.home-grid')!;
    const newButton = host.querySelector<HTMLButtonElement>('.home-new')!;

    const showError = (message: string | null) => {
        errorLine.textContent = message ?? '';
        errorLine.hidden = !message;
    };
    const failure = (error: unknown) => isOffline(error) ? OFFLINE : (error as Error).message;

    const params = new URLSearchParams(window.location.search);
    const opened = params.get('error');
    if (opened) {
        showError(opened);
        // Keep the message on screen but not in the address bar (a reload should not repeat it).
        window.history.replaceState(null, '', '/');
    }

    newButton.onclick = async () => {
        newButton.disabled = true;
        try {
            const doc = await createProject();
            window.location.assign(projectUrl(doc.id));
        } catch (error) {
            showError(failure(error));
            newButton.disabled = false;
        }
    };

    const card = (row: ProjectRow) => {
        const item = document.createElement('article');
        item.className = 'project-card';
        item.dataset.project = row.id;
        const link = document.createElement('a');
        link.className = 'project-open';
        link.href = projectUrl(row.id);
        const thumb = document.createElement('span');
        thumb.className = 'typology-thumb';
        thumb.innerHTML = PLACEHOLDER;
        const image = document.createElement('img');
        image.alt = '';
        image.hidden = true;
        image.addEventListener('load', () => (image.hidden = false));
        image.addEventListener('error', () => (image.hidden = true));
        image.src = previewUrl(row);
        thumb.append(image);
        const name = document.createElement('span');
        name.className = 'project-name';
        name.textContent = row.name;
        const updated = document.createElement('span');
        updated.className = 'project-updated';
        updated.textContent = `Updated ${formatUpdated(row.updatedAt)}`;
        link.append(thumb, name, updated);
        if (row.generating) {
            item.classList.add('generating');
            const busy = document.createElement('span');
            busy.className = 'project-generating';
            busy.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Generating model…</span>';
            thumb.append(busy);
            link.setAttribute('aria-busy', 'true');
        }

        const actions = document.createElement('div');
        actions.className = 'project-actions';
        const rename = document.createElement('button');
        rename.type = 'button';
        rename.textContent = 'Rename';
        rename.setAttribute('aria-label', `Rename ${row.name}`);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'danger';
        remove.textContent = 'Delete';
        remove.setAttribute('aria-label', `Delete ${row.name}`);
        actions.append(rename, remove);

        rename.onclick = () => {
            const input = document.createElement('input');
            input.className = 'project-name-input';
            input.value = row.name;
            input.maxLength = 120;
            input.setAttribute('aria-label', 'Project name');
            name.replaceWith(input);
            input.focus();
            input.select();
            let done = false;
            const finish = async (save: boolean) => {
                if (done) return;
                done = true;
                const next = input.value.trim();
                if (save && next && next !== row.name) {
                    try {
                        const doc = await renameProject(row.id, next);
                        row.name = doc.name;
                        name.textContent = doc.name;
                        rename.setAttribute('aria-label', `Rename ${doc.name}`);
                        remove.setAttribute('aria-label', `Delete ${doc.name}`);
                        showError(null);
                    } catch (error) {
                        showError(failure(error));
                    }
                }
                input.replaceWith(name);
            };
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') void finish(true);
                else if (event.key === 'Escape') void finish(false);
            });
            input.addEventListener('blur', () => void finish(true));
        };

        remove.onclick = async () => {
            if (!window.confirm(`Delete “${row.name}”? Its photo models are deleted too. This cannot be undone.`)) return;
            remove.disabled = true;
            try {
                await deleteProject(row.id);
                item.remove();
                if (!grid.querySelector('.project-card')) showEmpty();
                showError(null);
            } catch (error) {
                showError(failure(error));
                remove.disabled = false;
            }
        };

        item.append(link, actions);
        return item;
    };

    const showEmpty = () => {
        statusLine.textContent = 'No projects yet. Create one to start designing.';
        statusLine.hidden = false;
    };

    let rows: ProjectRow[];
    try {
        rows = await listProjects();
    } catch (error) {
        showError(failure(error));
        return;
    }
    newButton.disabled = false;
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    grid.replaceChildren(newButton, ...rows.map(card));
    if (!rows.length) showEmpty();

    // While a model is being generated, refresh those cards until it is done (preview appears).
    const poll = async () => {
        if (!host.isConnected || host.hidden) return;
        try {
            const latest = await listProjects();
            for (const row of latest) {
                const current = grid.querySelector<HTMLElement>(`.project-card[data-project="${CSS.escape(row.id)}"]`);
                if (current && current.classList.contains('generating') !== Boolean(row.generating)) current.replaceWith(card(row));
            }
            if (!latest.some(row => row.generating)) return;
        } catch { /* service briefly unreachable: try again */ }
        setTimeout(() => void poll(), 3000);
    };
    if (rows.some(row => row.generating)) setTimeout(() => void poll(), 3000);
}
