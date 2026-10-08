/** 上传区：选择项目、拖放 / 选择照片、可选宽度。用户唯一的手动操作。 */
import { listProjects, upload } from '../api.ts';
import type { FacadeSide } from '../api.ts';

import { el } from './dom.ts';

const NEW_PROJECT = '';

export function createUploadPanel(host: HTMLElement, onProjectChange: (projectId: string | null) => void) {
    const select = el('select', { className: 'project-select', ariaLabel: 'Project' });
    const files = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    const drop = el('button', { type: 'button', className: 'drop-zone' }, 'Drop photos here, or click to choose');
    const width = el('input', { type: 'number', min: '1', step: '1', placeholder: 'Optional; the LM estimates it if blank', className: 'width-input' });
    const side = el('select', { className: 'project-select', ariaLabel: 'Which side of the house the photos show' });
    side.append(el('option', { value: 'back' }, 'Back of the house (garden side)'), el('option', { value: 'front' }, 'Front of the house (street side)'));
    const submit = el('button', { type: 'button', className: 'primary', disabled: true }, 'Upload');
    const message = el('p', { className: 'form-message' });
    let chosen: File[] = [];

    const choose = (list: FileList | null) => {
        chosen = [...(list ?? [])].filter((file) => file.type.startsWith('image/'));
        drop.textContent = chosen.length ? `${chosen.length} photo${chosen.length === 1 ? '' : 's'} selected` : 'Drop photos here, or click to choose';
        submit.disabled = !chosen.length;
    };
    drop.onclick = () => files.click();
    files.onchange = () => choose(files.files);
    drop.ondragover = (event) => {
        event.preventDefault();
        drop.classList.add('dragging');
    };
    drop.ondragleave = () => drop.classList.remove('dragging');
    drop.ondrop = (event) => {
        event.preventDefault();
        drop.classList.remove('dragging');
        choose(event.dataTransfer?.files ?? null);
    };
    select.onchange = () => onProjectChange(select.value || null);
    submit.onclick = async () => {
        const value = width.value.trim();
        const widthMm = value === '' ? null : Number(value);
        if (widthMm !== null && !(widthMm > 0)) {
            message.textContent = 'Width must be a number of millimetres greater than 0, or left blank.';
            return;
        }
        submit.disabled = true;
        message.textContent = 'Uploading…';
        try {
            const projectId = await upload(chosen, widthMm, select.value || null, side.value as FacadeSide);
            await refreshProjects(projectId);
            choose(null);
            files.value = '';
            width.value = '';
            message.textContent = `Uploaded to ${projectId}. Modelling has started; the model appears here when it is ready.`;
            onProjectChange(projectId);
        } catch (error) {
            message.textContent = (error as Error).message;
            submit.disabled = false;
        }
    };

    async function refreshProjects(current: string | null) {
        const projects = await listProjects();
        select.replaceChildren(el('option', { value: NEW_PROJECT }, 'New project'), ...projects.map((id) => el('option', { value: id }, id)));
        select.value = current ?? NEW_PROJECT;
    }

    host.append(
        el('h2', {}, 'Upload photos'),
        el('label', { className: 'field' }, 'Project', select),
        drop,
        files,
        el('label', { className: 'field' }, 'The photos show', side),
        el('label', { className: 'field' }, 'Facade width (mm)', width),
        submit,
        message
    );
    return { refreshProjects };
}
