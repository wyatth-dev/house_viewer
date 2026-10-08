/** 单面照片上传：预留四个立面入口，当前一次只处理一个面。 */
import { fileUrl, runAgain, uploadPhotos } from '../api.ts';
import type { FacadeSide, PhotoModelSummary } from '../api.ts';
import { el } from './dom.ts';

/** `projectId` is the user project; the photo model being edited is set with setPhotoModel. */
export function createUploadPanel(host: HTMLElement, projectId: string, onModelChange: (photoModelId: string | null) => void, onPhotoSelect: (id: string | null, originalUrl?: string) => void = () => {}, getName: () => string = () => '') {
    const width = el('input', { type: 'number', min: '1', step: '1', placeholder: 'Optional; the LM estimates it if blank', className: 'width-input' });
    const widthLabel = el('span', { className: 'wall-width-label' }, 'Back wall width (mm) · Optional');
    let widthSide: FacadeSide = 'back';
    const editedWidths = new Set<FacadeSide>();
    const widthDrafts = new Map<FacadeSide, string>();
    const selectWidth = (side: FacadeSide) => {
        widthDrafts.set(widthSide, width.value);
        widthSide = side;
        widthLabel.textContent = side === 'front' ? 'Facade width (mm) · Optional' : `${side.charAt(0).toUpperCase() + side.slice(1)} wall width (mm) · Optional`;
        const value = saved?.wallWidths?.[side] ?? (saved?.facadeSide === side ? saved.width.widthMm : null);
        width.value = widthDrafts.get(side) ?? (value == null ? '' : String(value));
    };
    width.oninput = () => { widthDrafts.set(widthSide, width.value); editedWidths.add(widthSide); update(); };
    const submit = el('button', { type: 'button', className: 'primary', disabled: true }, 'Generate');
    const clear = el('button', { type: 'button', className: 'product-edit-back', hidden: true }, 'Clear selected photos');
    const message = el('p', { className: 'form-message' });
    const faces = el('div', { className: 'photo-face-inputs' });
    let modelId: string | null = null;
    let selected: FacadeSide | null = null;
    let chosen: File[] = [];
    let uploading = false;
    let saved: PhotoModelSummary | null = null;
    let photoSignature = '';
    const localUrls: string[] = [];
    const releaseLocal = () => { for (const url of localUrls) URL.revokeObjectURL(url); localUrls.length = 0; };
    const controls = new Map<FacadeSide, { files: HTMLInputElement; drop: HTMLButtonElement; thumbnails: HTMLSpanElement }>();
    const notice = el('dialog', { className: 'single-face-dialog' });
    const proceed = el('button', { type: 'button', className: 'primary' }, 'Continue');
    const cancel = el('button', { type: 'button', className: 'single-face-cancel' }, 'Cancel');
    notice.append(el('h2', {}, 'One facade at a time'),
        el('p', {}, 'We currently support modelling and rendering one facade at a time. The facade you upload will be modelled. Photos are kept for each facade. For now, each generation renders only the selected facade.'), proceed, cancel);
    host.append(notice);
    let continueUpload: (() => void) | null = null;
    const warn = (side: FacadeSide, action: () => void) => {
        const current = selected ?? saved?.facadeSide;
        if (!current || current === side) { action(); return; }
        continueUpload = action; notice.showModal();
    };
    proceed.onclick = () => { notice.close(); const action = continueUpload; continueUpload = null; action?.(); };
    cancel.onclick = () => { continueUpload = null; notice.close(); };
    notice.oncancel = () => { continueUpload = null; };
    const update = () => {
        for (const [side, { files, drop }] of controls) {
            files.disabled = drop.disabled = uploading;
            const hasPhotos = controls.get(side)!.thumbnails.childElementCount > 0;
            drop.classList.toggle('has-photos', hasPhotos);
            drop.querySelector('.face-hint')!.textContent = hasPhotos ? 'Upload' : 'Choose photos';
        }
        clear.hidden = !chosen.length;
        clear.disabled = uploading;
        const storedWidth = saved?.wallWidths?.[widthSide] ?? (saved?.facadeSide === widthSide ? saved.width.widthMm : null);
        const enteredWidth = width.value.trim() === '' ? null : Number(width.value);
        const widthChanged = editedWidths.has(widthSide) && saved?.facadeSide === widthSide && enteredWidth !== storedWidth;
        const busy = saved?.job?.state === 'queued' || saved?.job?.state === 'running';
        submit.disabled = uploading || busy || (!chosen.length && !(saved?.photos.length && widthChanged));
        submit.textContent = saved?.latestBuild ? 'Regenerate' : 'Generate';
    };
    for (const side of ['front', 'back', 'left', 'right'] as const) {
        const files = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, ariaLabel: `${side} photos` });
        const drop = el('button', { type: 'button', className: 'drop-zone' });
        const thumbnails = el('span', { className: 'face-thumbnails' });
        drop.append(el('strong', { className: 'face-title' }, side.charAt(0).toUpperCase() + side.slice(1)),
            thumbnails, el('span', { className: 'face-hint' }, 'Choose photos'));
        const choose = (list: FileList | File[] | null) => {
            const photos = [...(list ?? [])].filter(file => file.type.startsWith('image/'));
            if (!photos.length) return;
            selectWidth(side);
            selected = side;
            chosen = [];
            releaseLocal();
            photoSignature = '';
            for (const control of controls.values()) control.thumbnails.replaceChildren();
            chosen = photos;
            thumbnails.replaceChildren(...photos.map(file => {
                const url = URL.createObjectURL(file);
                localUrls.push(url);
                const image = el('img', { src: url, alt: file.name });
                return image;
            }));
            update();
        };
        drop.onclick = () => warn(side, () => files.click());
        files.onchange = () => choose(files.files);
        files.oncancel = () => { selectWidth(selected ?? saved?.facadeSide ?? 'back'); update(); };
        drop.ondragover = event => { if (!drop.disabled) { event.preventDefault(); drop.classList.add('dragging'); } };
        drop.ondragleave = () => drop.classList.remove('dragging');
        drop.ondrop = event => {
            event.preventDefault();
            drop.classList.remove('dragging');
            if (!drop.disabled) {
                const dropped = [...(event.dataTransfer?.files ?? [])];
                warn(side, () => choose(dropped));
            }
        };
        controls.set(side, { files, drop, thumbnails });
        faces.append(drop, files);
    }
    const showSavedPhotos = () => {
        const signature = JSON.stringify([saved?.id, saved?.facadeSide, saved?.photos, saved?.facadePhotos]);
        if (signature === photoSignature || chosen.length) return;
        photoSignature = signature;
        for (const [side, control] of controls) {
            control.thumbnails.replaceChildren(...(saved?.facadePhotos?.[side] ?? (saved?.facadeSide === side ? saved.photos : [])).map(photo => {
                const image = el('img', { src: fileUrl(projectId, saved!.id, photo.file), alt: photo.id, tabIndex: 0 });
                image.setAttribute('role', 'button');
                image.setAttribute('aria-label', `Compare ${photo.id}`);
                const selectPhoto = () => {
                    selectWidth(side);
                    onPhotoSelect(photo.id);
                    for (const candidate of control.thumbnails.children) candidate.classList.toggle('selected', candidate === image);
                };
                image.onclick = event => { event.stopPropagation(); event.preventDefault(); selectPhoto(); };
                image.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); event.preventDefault(); selectPhoto(); } };
                return image;
            }));
        }
    };
    const reset = () => {
        selected = saved?.photos.length ? saved.facadeSide : null;
        chosen = [];
        releaseLocal();
        photoSignature = '';
        showSavedPhotos();
        for (const { files } of controls.values()) files.value = '';
        onPhotoSelect(null);
        update();
    };
    clear.onclick = reset;
    submit.onclick = async () => {
        if (submit.disabled || uploading) return;
        const uploadSide = chosen.length ? selected : saved?.facadeSide;
        const widthValue = uploadSide === widthSide ? width.value : widthDrafts.get(uploadSide!) ?? '';
        const widthMm = widthValue.trim() === '' ? null : Number(widthValue);
        if (widthMm !== null && (!Number.isFinite(widthMm) || widthMm <= 0)) {
            message.textContent = 'Width must be greater than 0 mm, or left blank.';
            return;
        }
        uploading = true;
        update();
        message.textContent = saved?.latestBuild ? 'Regenerating…' : 'Generating…';
        try {
            if (chosen.length && selected) {
                modelId = await uploadPhotos(projectId, chosen, widthMm, modelId, selected, getName());
                chosen = [];
            } else if (modelId) await runAgain(projectId, modelId, widthMm);
            if (uploadSide) editedWidths.delete(uploadSide);
            if (selected) widthDrafts.set(selected, widthValue);
            message.textContent = 'Modelling has started.';
            onModelChange(modelId);
        } catch (error) { message.textContent = (error as Error).message; }
        finally { uploading = false; update(); }
    };
    host.append(el('h2', {}, el('span', {}, '01'), ' Upload photos'), faces, clear,
        el('label', { className: 'field wall-width-field' }, widthLabel, width), submit, message);
    update();
    return {
        setPhotoModel(current: string | null) { modelId = current; saved = null; widthDrafts.clear(); editedWidths.clear(); width.value = ''; reset(); message.textContent = ''; },
        updatePhotoModel(summary: PhotoModelSummary | null, commit = true) {
            if (!commit) {
                if (saved && summary) saved = { ...saved, job: summary.job };
                update();
                return;
            }
            saved = summary;
            if (!chosen.length && !editedWidths.has(widthSide)) {
                const currentWidth = saved?.wallWidths?.[widthSide] ?? (saved?.facadeSide === widthSide ? saved.width.widthMm : null);
                width.value = currentWidth == null ? '' : String(currentWidth);
                widthDrafts.set(widthSide, width.value);
            }
            if (!chosen.length) {
                selected = saved?.photos.length ? saved.facadeSide : null;
                releaseLocal();
            }
            showSavedPhotos();
            update();
        },
        destroy() { releaseLocal(); notice.close(); notice.remove(); },
        setPhotoModelDetails(facadeSide: FacadeSide, widthMm: number | null) {
            selectWidth(facadeSide);
            width.value = widthMm === null ? '' : String(widthMm);
            widthDrafts.set(facadeSide, width.value);
        }
    };
}
