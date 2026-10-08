import type { Autosave, AutosaveStatus } from './autosave.ts';

/**
 * The row above the panel heading in the editor: back to Your projects, the project name
 * (click to rename) and the save status. Renaming goes through `rename` (the editor's autosave),
 * not PUT /name: a separate rename request would bump the revision under the autosave.
 */
export function createProjectBar(autosave: Autosave, rename: (name: string) => void) {
    const element = document.createElement('div');
    element.className = 'project-bar';
    const back = document.createElement('a');
    back.className = 'project-back';
    back.href = '/';
    back.setAttribute('aria-label', 'Home — Your projects');
    back.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>Home</span>';
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'project-title';
    name.title = 'Rename project';
    const save = document.createElement('span');
    save.className = 'save-status';
    save.setAttribute('role', 'status');
    save.setAttribute('aria-live', 'polite');
    element.append(back, name, save);

    const showName = () => {
        name.textContent = autosave.get().name;
        name.setAttribute('aria-label', `Project name: ${autosave.get().name}. Rename`);
    };
    showName();

    name.onclick = () => {
        const input = document.createElement('input');
        input.className = 'project-name-input';
        input.value = autosave.get().name;
        input.maxLength = 120;
        input.setAttribute('aria-label', 'Project name');
        name.replaceWith(input);
        input.focus();
        input.select();
        let done = false;
        const finish = (keep: boolean) => {
            if (done) return;
            done = true;
            const next = input.value.trim().slice(0, 120);
            if (keep && next && next !== autosave.get().name) rename(next);
            input.replaceWith(name);
            showName();
        };
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') finish(true);
            else if (event.key === 'Escape') finish(false);
        });
        input.addEventListener('blur', () => finish(true));
    };

    const action = (label: string, run: () => void) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'save-action';
        button.textContent = label;
        button.onclick = run;
        return button;
    };
    const render = (status: AutosaveStatus) => {
        save.dataset.status = status;
        if (status === 'saved') save.replaceChildren('Saved');
        else if (status === 'saving') save.replaceChildren('Saving…');
        else if (status === 'error') save.replaceChildren('Not saved · ', action('Retry', () => autosave.retry()));
        else {
            save.replaceChildren(
                'Changed elsewhere · ',
                // Reload: the simplest reliable way to show the server's version is to open the project
                // again. Dropping the local changes first keeps the leave-page prompt from appearing.
                action('Reload', () => {
                    void autosave.resolveConflict('reload').finally(() => location.reload());
                }),
                ' / ',
                action('Keep mine', () => {
                    void autosave.resolveConflict('keep').catch((error) => console.error(error));
                })
            );
        }
    };
    render(autosave.status);
    const unsubscribe = autosave.onStatus(render);

    return {
        element,
        destroy() {
            unsubscribe();
            element.remove();
        }
    };
}
