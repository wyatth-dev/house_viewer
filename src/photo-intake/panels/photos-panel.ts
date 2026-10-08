/** 照片面板：原图与 LM 矫正后的正视图（只读）。 */
import { fileUrl } from '../api.ts';
import type { PhotoInfo } from '../api.ts';

import { el } from './dom.ts';

export function createPhotosPanel(host: HTMLElement) {
    const list = el('div', { className: 'photo-list' });
    host.append(el('h2', {}, 'Photos'), list);
    let signature = '';
    return {
        update(projectId: string | null, photos: PhotoInfo[]) {
            const next = JSON.stringify([projectId, photos]);
            if (next === signature) return;
            signature = next;
            if (!projectId || !photos.length) {
                list.replaceChildren(el('p', { className: 'muted' }, 'No photos yet'));
                return;
            }
            list.replaceChildren(
                ...photos.map((photo) =>
                    el(
                        'figure',
                        { className: 'photo' },
                        el('img', { src: fileUrl(projectId, photo.file), alt: photo.id, loading: 'lazy' }),
                        ...(photo.rectified
                            ? [el('img', { src: `${fileUrl(projectId, photo.rectified)}?t=${Date.now()}`, alt: `${photo.id} rectified` })]
                            : []),
                        el('figcaption', {}, `${photo.id}${photo.primary ? ' · primary' : ''}${photo.rectified ? ' · rectified' : ''}`)
                    )
                )
            );
        }
    };
}
