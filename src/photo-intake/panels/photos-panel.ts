/** 照片面板：原图与 LM 矫正后的正视图（只读）。 */
import { fileUrl } from '../api.ts';
import type { PhotoInfo } from '../api.ts';

import { el } from './dom.ts';

export function createPhotosPanel(host: HTMLElement) {
    const list = el('div', { className: 'photo-list' });
    host.append(el('h2', {}, el('span', {}, '02'), ' Photo Rectification'), list);
    const preview = el('dialog', { className: 'photo-preview-dialog' });
    const close = el('button', { type: 'button', className: 'photo-preview-close', ariaLabel: 'Close image preview' }, '×');
    const enlarged = el('img', { alt: '' });
    preview.append(close, enlarged);
    host.append(preview);
    close.onclick = () => preview.close();
    preview.onclick = event => { if (event.target === preview) preview.close(); };
    const image = (url: string, alt: string) => {
        const button = el('button', { type: 'button', className: 'photo-preview-button', ariaLabel: `Enlarge ${alt}` }, el('img', { src: url, alt }));
        button.onclick = () => { enlarged.src = url; enlarged.alt = alt; preview.showModal(); };
        return button;
    };
    let signature = '';
    return {
        destroy() { preview.close(); preview.remove(); },
        showOriginal(url: string) {
            signature = '';
            list.replaceChildren(el('div', { className: 'photo-comparison' },
                el('figure', { className: 'photo' }, el('figcaption', {}, 'Original'), image(url, 'Original photo')),
                el('figure', { className: 'photo' }, el('figcaption', {}, 'Rectified'), el('p', { className: 'muted' }, 'Waiting for generation'))));
        },
        update(projectId: string | null, photos: PhotoInfo[], selectedId: string | null = null) {
            const next = JSON.stringify([projectId, photos, selectedId]);
            if (next === signature) return;
            signature = next;
            if (!projectId || !photos.length) {
                list.replaceChildren(el('p', { className: 'muted' }, 'No photos yet'));
                return;
            }
            const photo = photos.find(item => item.id === selectedId) ?? photos.find(item => item.primary) ?? photos[0];
            list.replaceChildren(el('div', { className: 'photo-comparison' },
                el('figure', { className: 'photo' }, el('figcaption', {}, 'Original'),
                    image(fileUrl(projectId, photo.file), `${photo.id} original`)),
                el('figure', { className: 'photo' }, el('figcaption', {}, 'Rectified'),
                    photo.rectified ? image(fileUrl(projectId, photo.rectified), `${photo.id} rectified`)
                        : el('p', { className: 'muted' }, 'Waiting for rectification'))));
        }
    };
}
