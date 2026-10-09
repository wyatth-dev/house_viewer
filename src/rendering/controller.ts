/**
 * Rendering step: Context photos, the Rendering Queue (model captures) and AI renders.
 *
 * Captures and Context uploads are files in the project's media folder; the project document
 * (media.references / media.renders) keeps their URLs and the render jobs. A job runs on the
 * service (OpenAI image edit with the prompts in prompts/ at the repository root);
 * the browser polls it until done and keeps polling after the editor is reopened.
 */
import type { Autosave } from '../projects/autosave.ts';
import type { ProjectDocument } from '../projects/state.ts';
import type { CameraSnapshot } from '../shared/camera/types.ts';

import { deleteMedia, getRender, getRenderOptions, startRender, uploadMedia } from './api.ts';
import { openRenderComparison } from './comparison.ts';
import { openContextDialog } from './context-dialog.ts';
import type { CaptureRef, RenderJob, RenderOptionGroup } from './contract.ts';
import { describeOptions, renderOptionsPanel } from './options-panel.ts';
import {
    addCapture, addContext, captures, contextPhotos, jobFor, needsContextSeed, removeCapture, removeContext,
    renderJobs, renderSettings, replaceCaptureUrl, seedContext, setRenderSetting, storeJob
} from './references.ts';

export type RenderingElements = {
    queue: HTMLElement;
    contextButton: HTMLButtonElement;
    contextCount: HTMLElement;
    /** Look & atmosphere choices (style, time of day, weather, season). */
    options: HTMLElement;
    message: HTMLElement;
};

export type RenderingControllerOptions = {
    projectId: string;
    autosave: Autosave;
    elements: RenderingElements;
    /** Screenshot of the current model view (JPEG) and the camera that produced it. */
    captureView(): Promise<{ blob: Blob; camera?: CameraSnapshot }>;
    restoreCamera(camera: CameraSnapshot): void;
    /** The photo house's original photo, or null when it has none. Throws when it cannot be loaded. */
    loadHousePhoto(typologyId: string): Promise<{ url: string; name: string } | null>;
    pollMs?: number;
};

const cameraIcon = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 6h4l2-3h4l2 3h4v14H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
const deleteIcon = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const errorText = (cause: unknown, fallback: string) => (cause instanceof Error && cause.message ? cause.message : fallback);

export function createRenderingController(options: RenderingControllerOptions) {
    const { projectId, autosave, elements } = options;
    const pollMs = options.pollMs ?? 2500;
    let disposed = false;
    let capturing = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let seeding: Promise<void> | undefined;
    const starting = new Set<string>();
    let justAdded: string | undefined; // drops in on the next render
    let groups: RenderOptionGroup[] = [];

    const doc = () => autosave.get();
    const update = (change: (doc: ProjectDocument) => ProjectDocument) => {
        if (disposed) return;
        autosave.update(change);
        render();
    };
    const say = (text: string) => {
        elements.message.textContent = text;
        elements.message.hidden = !text;
    };

    const stateOf = (capture: CaptureRef): RenderJob['status'] | 'idle' =>
        starting.has(capture.url) ? 'queued' : jobFor(doc(), capture.url)?.status ?? 'idle';

    const doneViews = () => captures(doc()).flatMap((capture, index) => {
        const job = jobFor(doc(), capture.url);
        return job?.status === 'done' && job.resultUrl
            ? [{ beforeUrl: capture.url, afterUrl: job.resultUrl, label: `View ${index + 1}`, url: capture.url, camera: capture.camera,
                details: describeOptions(groups, job.options) }] : [];
    });

    /** Opens the before/after dialog on this capture's render; switching views moves the model too. */
    function showComparison(sourceUrl: string) {
        const views = doneViews();
        const at = views.findIndex(view => view.url === sourceUrl);
        if (at >= 0) openRenderComparison(views, at, view => { if (view.camera) options.restoreCamera(view.camera); });
        return at >= 0;
    }

    /** A render just finished: show it right away, unless another dialog is open. */
    async function presentFinished(sourceUrl: string, resultUrl: string | null) {
        if (resultUrl) {
            const image = new Image();
            image.src = resultUrl;
            await image.decode().catch(() => undefined); // drop in with the image already loaded
        }
        if (disposed || document.querySelector('dialog[open]')) return;
        const capture = captures(doc()).find(item => item.url === sourceUrl);
        if (capture?.camera) options.restoreCamera(capture.camera);
        showComparison(sourceUrl);
    }

    // ---- Queue ----------------------------------------------------------------------------
    function card(capture: CaptureRef, index: number) {
        const job = jobFor(doc(), capture.url);
        const state = stateOf(capture);
        const element = document.createElement('div');
        element.className = capture.url === justAdded ? 'render-card dropping' : 'render-card';
        element.dataset.state = state;

        const photo = document.createElement('button');
        photo.type = 'button';
        photo.className = 'render-card-photo';
        const image = document.createElement('img');
        image.src = state === 'done' && job?.resultUrl ? job.resultUrl : capture.url;
        image.alt = '';
        photo.append(image);
        photo.setAttribute('aria-label', state === 'done' ? `Compare before and after for view ${index + 1}` : `Go back to view ${index + 1}`);
        photo.onclick = () => {
            // The model always returns to this view's camera, rendered or not.
            if (capture.camera) options.restoreCamera(capture.camera);
            showComparison(capture.url);
        };

        const badge = document.createElement('span');
        badge.className = 'render-card-badge';
        badge.textContent = { idle: '', queued: 'Rendering…', running: 'Rendering…', done: 'Rendered', failed: 'Not rendered' }[state];
        badge.hidden = state === 'idle';

        const renderButton = document.createElement('button');
        renderButton.type = 'button';
        renderButton.className = 'render-card-render';
        renderButton.textContent = state === 'done' ? 'Render again' : 'Render';
        renderButton.setAttribute('aria-label', `${renderButton.textContent} view ${index + 1}`);
        renderButton.hidden = state === 'queued' || state === 'running';
        renderButton.onclick = () => void requestRender(capture);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'render-card-delete';
        remove.setAttribute('aria-label', `Delete view ${index + 1}`);
        remove.innerHTML = deleteIcon;
        remove.onclick = () => {
            update(current => removeCapture(current, capture.url));
            void deleteMedia(projectId, capture.url).catch(() => undefined);
        };

        element.append(photo, badge, renderButton, remove);
        if (state === 'queued' || state === 'running') {
            const spinner = document.createElement('span');
            spinner.className = 'render-card-spinner';
            spinner.setAttribute('aria-hidden', 'true');
            element.append(spinner);
        }
        if (state === 'failed' && job?.error) {
            const error = document.createElement('p');
            error.className = 'render-card-error';
            error.textContent = job.error;
            element.append(error);
        }
        return element;
    }

    // Queue layout, built once so the list keeps its scroll position across updates: the views in a
    // list with up/down buttons, Batch render at the bottom. Capturing is the lens button on the canvas.
    const empty = document.createElement('p');
    empty.className = 'hint render-list-empty';
    empty.innerHTML = `${cameraIcon}<span>Frame a view, then press the camera in the middle of the scene.</span>`;
    const list = document.createElement('div');
    list.className = 'render-list';
    list.tabIndex = -1;
    const arrow = (direction: -1 | 1) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `render-list-arrow ${direction < 0 ? 'up' : 'down'}`;
        button.setAttribute('aria-label', direction < 0 ? 'Show earlier views' : 'Show later views');
        button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${direction < 0 ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        button.onclick = () => list.scrollBy({ top: direction * list.clientHeight * 0.85,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        return button;
    };
    const up = arrow(-1);
    const down = arrow(1);
    const rail = document.createElement('div');
    rail.className = 'render-rail';
    rail.append(up, list, down);
    const updateArrows = () => {
        const overflow = list.scrollHeight > list.clientHeight + 1;
        rail.classList.toggle('overflowing', overflow);
        up.hidden = !overflow || list.scrollTop <= 1;
        down.hidden = !overflow || list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
    };
    list.addEventListener('scroll', updateArrows, { passive: true });
    const resizeObserver = new ResizeObserver(updateArrows);
    resizeObserver.observe(list);
    const batchButton = document.createElement('button');
    batchButton.type = 'button';
    batchButton.className = 'step-button render-batch';
    batchButton.onclick = () => void renderAll();
    elements.queue.replaceChildren(empty, rail, batchButton);

    /** Captures started by Batch render: each card unlocks when its render is done; no dialog pops up. */
    const batch = new Set<string>();
    let batchTotal = 0;

    function renderBatchButton() {
        const all = captures(doc());
        const pending = all.filter(item => stateOf(item) === 'idle' || stateOf(item) === 'failed');
        // Only offered while some views have no render yet; rendered views are never redone here.
        batchButton.hidden = pending.length === 0 && batch.size === 0;
        batchButton.disabled = batch.size > 0;
        if (batch.size > 0) {
            batchButton.innerHTML = `<span class="render-batch-spinner" aria-hidden="true"></span>Rendering… ${batchTotal - batch.size} of ${batchTotal} ready`;
        } else {
            batchTotal = 0;
            batchButton.textContent = `Batch render · ${pending.length} view${pending.length === 1 ? '' : 's'}`;
        }
    }

    function render() {
        if (disposed) return;
        // Newest capture on top; numbering stays chronological (View 1 is the first capture).
        list.replaceChildren(...captures(doc()).map(card).reverse());
        justAdded = undefined;
        list.hidden = list.children.length === 0;
        empty.hidden = !list.hidden;
        renderBatchButton();
        requestAnimationFrame(updateArrows);
        renderOptionsPanel(elements.options, groups, renderSettings(doc(), groups),
            (group, option) => update(current => setRenderSetting(current, group, option)));
        const count = contextPhotos(doc()).length;
        elements.contextCount.textContent = count ? `${count} photo${count === 1 ? '' : 's'}` : 'Add photos';
    }

    /** Starts every capture that has no render yet; views that are rendered or rendering are left alone. */
    async function renderAll() {
        const targets = captures(doc()).filter(item => stateOf(item) === 'idle' || stateOf(item) === 'failed');
        for (const item of targets) batch.add(item.url);
        batchTotal = batch.size;
        say('');
        // Started one after another (the service runs two at a time); each card unlocks on its own.
        for (const item of targets) {
            if (disposed) return;
            await requestRender(item, true);
        }
    }

    async function capture() {
        if (capturing) return;
        capturing = true;
        say('');
        render();
        try {
            const { blob, camera } = await options.captureView();
            const [file] = await uploadMedia(projectId, 'captures', [blob]);
            justAdded = file.url;
            list.scrollTo({ top: 0 });
            update(current => addCapture(current, camera ? { url: file.url, camera } : { url: file.url }));
        } catch (cause) {
            if (!disposed) say(`Could not capture this view. ${errorText(cause, '')}`.trim());
            console.error(cause);
        } finally {
            capturing = false;
            render();
        }
    }

    // ---- Renders --------------------------------------------------------------------------
    async function requestRender(capture: CaptureRef, quiet = false) {
        const status = stateOf(capture);
        if (status === 'queued' || status === 'running') return;
        let sourceUrl = capture.url;
        if (quiet) batch.add(sourceUrl);
        else batch.delete(sourceUrl);
        starting.add(sourceUrl);
        say('');
        render();
        const referencePhotoUrls = contextPhotos(doc()).map(item => item.url);
        const settings = renderSettings(doc(), groups);
        try {
            if (sourceUrl.startsWith('data:')) { // captures saved before media uploads existed
                const blob = await (await fetch(sourceUrl)).blob();
                const [file] = await uploadMedia(projectId, 'captures', [blob]);
                const from = sourceUrl;
                starting.delete(from);
                starting.add(file.url);
                if (batch.delete(from)) batch.add(file.url);
                update(current => replaceCaptureUrl(current, from, file.url));
                sourceUrl = file.url;
            }
            const job = await startRender(projectId, sourceUrl, referencePhotoUrls, settings);
            update(current => storeJob(current, {
                id: job.id, sourceUrl, camera: capture.camera, mode: 'model', referencePhotoUrls, status: job.state,
                options: job.options ?? settings
            }));
            schedulePoll();
        } catch (cause) {
            const message = errorText(cause, 'Rendering could not start.');
            update(current => storeJob(current, {
                id: `failed-${crypto.randomUUID()}`, sourceUrl, camera: capture.camera, mode: 'model',
                referencePhotoUrls, status: 'failed', error: message
            }));
            if (!quiet) say(message);
            batch.delete(sourceUrl);
        } finally {
            starting.delete(sourceUrl);
            render();
        }
    }

    async function poll() {
        pollTimer = undefined;
        const active = renderJobs(doc()).filter(job => job.status === 'queued' || job.status === 'running');
        for (const job of active) {
            try {
                const state = await getRender(projectId, job.id);
                if (disposed) return;
                if (state.state === job.status) continue;
                // Batch renders only unlock their card; a single render opens the comparison.
                const fromBatch = batch.has(job.sourceUrl);
                if (state.state === 'done' || state.state === 'failed') batch.delete(job.sourceUrl);
                update(current => storeJob(current, {
                    ...job, status: state.state, resultUrl: state.resultUrl ?? undefined, error: state.error ?? undefined
                }));
                if (state.state === 'done') {
                    say('Render ready. Click the image to compare before and after.');
                    if (!fromBatch) void presentFinished(job.sourceUrl, state.resultUrl);
                }
            } catch (cause) {
                if (disposed) return;
                if (errorText(cause, '').startsWith('Render not found'))
                    update(current => storeJob(current, { ...job, status: 'failed', error: 'This render is no longer available.' }));
                // Otherwise the service is unreachable for now: try again on the next tick.
            }
        }
        schedulePoll();
    }

    function schedulePoll() {
        if (disposed || pollTimer) return;
        if (!renderJobs(doc()).some(job => job.status === 'queued' || job.status === 'running')) return;
        pollTimer = setTimeout(() => void poll(), pollMs);
    }

    // ---- Context --------------------------------------------------------------------------
    function ensureContextSeed(): Promise<void> {
        if (seeding || !needsContextSeed(doc())) return seeding ?? Promise.resolve();
        const typologyId = doc().house.typologyId;
        seeding = options.loadHousePhoto(typologyId).then((photo) => {
            if (disposed || doc().house.typologyId !== typologyId) return;
            update(current => seedContext(current, photo));
        }).catch(cause => console.error('Could not load the house photo for Context', cause))
            .finally(() => { seeding = undefined; });
        return seeding;
    }

    const openContext = () => {
        void ensureContextSeed();
        openContextDialog({
            list: () => contextPhotos(doc()),
            add: async (files) => {
                const saved = await uploadMedia(projectId, 'context', files);
                update(current => addContext(current, saved.map(file => ({ url: file.url, name: file.name }))));
            },
            remove: async (item) => {
                update(current => removeContext(current, item.url));
                if (item.origin === 'upload') await deleteMedia(projectId, item.url).catch(() => undefined);
            }
        });
    };
    elements.contextButton.addEventListener('click', openContext);

    // Option groups come from prompts/options.toml; reloaded each time the step opens.
    const loadOptions = () => getRenderOptions().then((loaded) => {
        if (disposed) return;
        groups = loaded;
        render();
    }).catch(cause => console.error('Could not load render options', cause));

    render();
    void loadOptions();
    schedulePoll();
    return {
        /** Captures the current model view into the list (the lens button on the canvas). */
        capture,
        /** Call when the Rendering step opens: the house may have changed since. */
        refresh() {
            render();
            schedulePoll();
            void loadOptions();
            void ensureContextSeed().then(render);
        },
        destroy() {
            disposed = true;
            resizeObserver.disconnect();
            if (pollTimer) clearTimeout(pollTimer);
            elements.contextButton.removeEventListener('click', openContext);
        }
    };
}
