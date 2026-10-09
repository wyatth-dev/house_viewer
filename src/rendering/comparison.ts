import type { CameraSnapshot } from '../shared/camera/types.ts';

import { iconSvg } from './options-panel.ts';

export type ComparisonView = {
    beforeUrl: string;
    afterUrl: string;
    label: string;
    camera?: CameraSnapshot;
    /** Look & atmosphere used for this render, shown under the title. */
    details?: { group: string; label: string; icon?: string | null }[];
};

const button = (className: string, label: string, html: string) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.setAttribute('aria-label', label);
    element.innerHTML = html;
    return element;
};

/**
 * Before/after dialog: the model capture (before) over the AI render (after), split by a draggable
 * handle. Both images have the same size (the service crops renders to the capture's size).
 * The strip below switches between all rendered views of the project; `onSelect` runs when the
 * user switches, so the model can follow to that view's camera.
 */
export function openRenderComparison(views: ComparisonView[], startIndex = 0, onSelect?: (view: ComparisonView) => void) {
    if (!views.length) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'render-comparison-dialog';
    dialog.setAttribute('aria-labelledby', 'render-comparison-title');
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.id = 'render-comparison-title';
    title.textContent = 'Your Veranda on Your Home';
    const close = button('render-comparison-close', 'Close', '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>');
    close.onclick = () => dialog.close();
    const details = document.createElement('ul');
    details.className = 'render-comparison-details';
    details.setAttribute('aria-label', 'Render settings');
    const heading = document.createElement('div');
    heading.append(title, details);
    header.append(heading, close);

    const stage = document.createElement('div');
    stage.className = 'render-comparison-stage';
    const after = document.createElement('img');
    after.className = 'render-comparison-after';
    after.alt = 'After: AI rendering';
    const before = document.createElement('img');
    before.className = 'render-comparison-before';
    before.alt = 'Before: model view';
    const divider = document.createElement('div');
    divider.className = 'render-comparison-divider';
    divider.setAttribute('aria-hidden', 'true');
    divider.innerHTML = '<span class="render-comparison-handle"><svg viewBox="0 0 24 24" width="22" height="22"><path d="m9 7-5 5 5 5M15 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
    const tags = document.createElement('div');
    tags.className = 'render-comparison-tags';
    tags.setAttribute('aria-hidden', 'true');
    tags.innerHTML = '<span>Before</span><span>After</span>';
    const caption = document.createElement('p');
    caption.className = 'render-comparison-caption';
    caption.textContent = 'Artist’s impression – for illustration only';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = '50';
    slider.className = 'render-comparison-slider';
    slider.setAttribute('aria-label', 'Before and after comparison');
    const setSplit = (percent: number) => {
        const value = Math.min(100, Math.max(0, percent));
        stage.style.setProperty('--split', `${value}%`);
        slider.value = String(Math.round(value));
    };
    slider.oninput = () => setSplit(Number(slider.value));
    let dragging = false;
    const fromPointer = (event: PointerEvent) => {
        const box = stage.getBoundingClientRect();
        setSplit(((event.clientX - box.left) / box.width) * 100);
    };
    stage.addEventListener('pointerdown', (event) => {
        dragging = true;
        stage.setPointerCapture(event.pointerId);
        fromPointer(event);
        slider.focus({ preventScroll: true });
    });
    stage.addEventListener('pointermove', (event) => { if (dragging) fromPointer(event); });
    const stop = () => { dragging = false; };
    stage.addEventListener('pointerup', stop);
    stage.addEventListener('pointercancel', stop);
    // Native image dragging would cancel the pointer drag.
    for (const image of [after, before]) image.draggable = false;
    stage.addEventListener('dragstart', event => event.preventDefault());
    stage.append(after, before, divider, tags, caption, slider);

    const strip = document.createElement('div');
    strip.className = 'render-comparison-views';
    strip.hidden = views.length < 2;
    const show = (index: number) => {
        after.src = views[index].afterUrl;
        before.src = views[index].beforeUrl;
        setSplit(50);
        details.replaceChildren(...(views[index].details ?? []).map((item) => {
            const chip = document.createElement('li');
            chip.title = item.group;
            chip.innerHTML = `${iconSvg(item.icon, 14)}<span></span>`;
            chip.querySelector('span')!.textContent = item.label;
            return chip;
        }));
        details.hidden = !details.children.length;
        for (const [i, item] of [...strip.children].entries()) item.setAttribute('aria-current', String(i === index));
    };
    strip.append(...views.map((view, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'render-comparison-view';
        const thumb = document.createElement('img');
        thumb.src = view.afterUrl;
        thumb.alt = '';
        const label = document.createElement('span');
        label.textContent = view.label;
        item.append(thumb, label);
        item.onclick = () => { show(index); onSelect?.(views[index]); };
        return item;
    }));
    show(Math.min(Math.max(0, startIndex), views.length - 1));

    dialog.append(header, stage, strip);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
    slider.focus({ preventScroll: true });
}
