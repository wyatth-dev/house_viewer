import type { ContextRef } from './contract.ts';

export type ContextDialogOptions = {
    list(): ContextRef[];
    add(files: File[]): Promise<void>;
    remove(item: ContextRef): Promise<void>;
};

const deleteIcon = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Context: photos of the real house and garden that guide materials and mood in AI renders.
 * Hover a photo to delete it (top right); the last tile uploads more (click or drop).
 */
export function openContextDialog(options: ContextDialogOptions) {
    const dialog = document.createElement('dialog');
    dialog.className = 'context-dialog';
    dialog.setAttribute('aria-labelledby', 'context-dialog-title');
    dialog.innerHTML = `
        <header>
            <h2 id="context-dialog-title">Context</h2>
            <button type="button" class="context-dialog-close" aria-label="Close"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        </header>
        <p class="hint">Photos of your house and garden. AI renders use them for materials, colours and mood; the camera view always comes from the model.</p>
        <div class="context-grid"></div>
        <p class="context-error" role="alert" hidden></p>
        <input type="file" accept="image/*,.heic,.heif" multiple hidden>
        <button type="button" class="step-button context-done">Done</button>
    `;
    const grid = dialog.querySelector<HTMLElement>('.context-grid')!;
    const error = dialog.querySelector<HTMLElement>('.context-error')!;
    const input = dialog.querySelector<HTMLInputElement>('input[type=file]')!;
    let busy = false;
    const fail = (message: string) => { error.textContent = message; error.hidden = !message; };

    const render = () => {
        const items = options.list().map((item) => {
            const card = document.createElement('figure');
            card.className = 'context-photo';
            const image = document.createElement('img');
            image.src = item.url;
            image.alt = item.name || 'Context photo';
            card.append(image);
            if (item.origin === 'house-photo') {
                const tag = document.createElement('figcaption');
                tag.textContent = 'House photo';
                card.append(tag);
            }
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'context-photo-delete';
            remove.setAttribute('aria-label', `Remove ${item.name || 'photo'} from Context`);
            remove.innerHTML = deleteIcon;
            remove.onclick = async () => {
                remove.disabled = true;
                fail('');
                try {
                    await options.remove(item);
                } catch (cause) {
                    fail(cause instanceof Error ? cause.message : 'Could not remove the photo.');
                }
                render();
            };
            card.append(remove);
            return card;
        });
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'context-add';
        add.disabled = busy;
        add.innerHTML = busy
            ? '<span class="context-spinner" aria-hidden="true"></span><span>Uploading…</span>'
            : '<span aria-hidden="true" class="context-add-plus">+</span><span>Add photos</span>';
        add.onclick = () => input.click();
        grid.replaceChildren(...items, add);
    };

    const upload = async (files: File[]) => {
        const images = files.filter(file => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name));
        if (!images.length || busy) return;
        busy = true;
        fail('');
        render();
        try {
            await options.add(images);
        } catch (cause) {
            fail(cause instanceof Error ? cause.message : 'Could not upload the photos.');
        } finally {
            busy = false;
            render();
        }
    };
    input.onchange = () => { void upload([...(input.files ?? [])]); input.value = ''; };
    dialog.addEventListener('dragover', (event) => { event.preventDefault(); dialog.classList.add('dragging'); });
    dialog.addEventListener('dragleave', (event) => { if (event.target === dialog) dialog.classList.remove('dragging'); });
    dialog.addEventListener('drop', (event) => {
        event.preventDefault();
        dialog.classList.remove('dragging');
        void upload([...(event.dataTransfer?.files ?? [])]);
    });
    dialog.querySelector<HTMLButtonElement>('.context-dialog-close')!.onclick = () => dialog.close();
    dialog.querySelector<HTMLButtonElement>('.context-done')!.onclick = () => dialog.close();
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.onclose = () => dialog.remove();
    render();
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
}
