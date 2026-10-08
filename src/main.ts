import { getProject } from './projects/api.ts';
import { parseProject } from './projects/state.ts';
import { resolveTypology } from './typology/catalog.ts';
// Load the stylesheet with the entry, not with the lazily imported app chunk: a failed
// web-font request inside a lazy chunk's CSS would otherwise stop the app from starting.
import './site-definition/style.css';

// `/` is the Your projects home page; `/?project=<pid>` edits that project.
const projectId = new URLSearchParams(window.location.search).get('project');
const workspace = document.querySelector<HTMLElement>('.workspace')!;

if (projectId === null) {
    workspace.hidden = true;
    const { renderHome } = await import('./projects/home.ts');
    await renderHome(document.querySelector<HTMLElement>('#home')!);
} else {
    let opened;
    try {
        const doc = parseProject(await getProject(projectId));
        // The typology must be active before the app modules load: house-config and
        // installation-faces read the active typology when they are first imported.
        const { entry } = await resolveTypology(doc.house, projectId);
        opened = { doc, entry };
    } catch (error) {
        // Missing (404), unreadable (422) or service not reachable: back to the home page with the reason.
        const offline = error instanceof TypeError || /\(HTTP 5\d\d\)$/.test((error as Error).message);
        const reason = offline
            ? 'The project service is not running. Start it with npm run dev.'
            : (error as Error).message;
        window.location.replace(`/?error=${encodeURIComponent(`Project ${projectId} could not be opened. ${reason}`)}`);
    }
    if (opened) {
        const { startSiteDefinition } = await import('./site-definition/start.ts');
        startSiteDefinition(opened.entry, opened.doc);
    }
}
