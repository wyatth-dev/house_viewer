/**
 * Embedded photo intake: the sidebar that replaces site setup while a photo model is
 * uploaded, generated and reviewed (New from photo, the edit button on a photo card,
 * `/?photo=new`, `/?project=<id>`). It reuses the main scene through `deps.scene`.
 */
import type { AppBase } from 'playcanvas';

import type { House } from '../scene/house/house.ts';
import type { CameraController } from '../shared/camera/index.ts';
import type { Panel } from '../site-definition/panel.ts';
import { loadTypology, typologyUrl } from '../typology/catalog.ts';
import type { TypologyEntry } from '../typology/catalog.ts';
import { activeTypology, parseTypology } from '../typology/index.ts';
import type { Typology, TypologyManifest } from '../typology/index.ts';

import { createAnnotations } from './annotations.ts';
import type { Annotation } from './annotations.ts';
import { fileUrl, getProject, publish, renameProject, runAgain } from './api.ts';
import type { ProjectSummary } from './api.ts';
import { createPhotosPanel } from './panels/photos-panel.ts';
import { createStatusPanel, statusText } from './panels/status-panel.ts';
import { createUploadPanel } from './panels/upload-panel.ts';

export type PhotoIntakeDeps = {
    app: AppBase;
    /** Holds the photo dimension layer and the generation overlay. */
    viewport: HTMLElement;
    /** #panel: the intake sidebar is appended here. */
    panelHost: HTMLElement;
    /** Scene status line. */
    status: HTMLElement;
    panel: Pick<Panel, 'onPhotoIntake' | 'setGenerating' | 'refreshTypologies'>;
    camera: Pick<CameraController, 'project' | 'onMove'>;
    signal: AbortSignal;
    isDisposed(): boolean;
    /** Re-apply the site dimension labels (this also closes an open label editor). */
    syncSiteDimensions(): void;
    scene: {
        switchTypology(entry: TypologyEntry, pushHistory?: boolean, supplied?: Typology): Promise<void>;
        /** Resolves when the typology switch in progress (if any) has finished. */
        whenSwitched(): Promise<void>;
        setHouseVisible(visible: boolean, model?: House, valid?: () => boolean): Promise<void>;
        house(): House;
        renderPreview(entry: TypologyEntry): void;
    };
};

export type PhotoIntake = {
    /** Follows the scene's Dimensions toggle. */
    setDimensionsVisible(visible: boolean): void;
    destroy(): void;
};

export function createPhotoIntake(deps: PhotoIntakeDeps): PhotoIntake {
    const { app, viewport, status, panel, camera, isDisposed } = deps;
    const { switchTypology, setHouseVisible, renderPreview } = deps.scene;
    const cleanups: (() => void)[] = [];
    const lifetime = { add: (cleanup: () => void) => void cleanups.push(cleanup) };
    const intake = document.createElement('div');
    intake.className = 'embedded-intake';
    intake.hidden = true;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'product-edit-back';
    back.textContent = '← Back to site setup';
    back.hidden = true;
    const navigation = document.querySelector('#product-edit-exit')!;
    navigation.before(back);
    const uploadHost = document.createElement('section');
    const statusHost = document.createElement('section');
    const photosHost = document.createElement('section');
    intake.append(uploadHost, photosHost, statusHost);
    deps.panelHost.append(intake);
    const siteStep = document.querySelector<HTMLElement>('#site-step')!;
    const annotationHost = document.createElement('div');
    annotationHost.className = 'photo-dimensions';
    viewport.append(annotationHost);
    const photoAnnotations = createAnnotations(app, annotationHost);
    lifetime.add(() => { photoAnnotations.destroy(); annotationHost.remove(); });
    lifetime.add(camera.onMove(() => photoAnnotations.refresh(camera.project)));
    let dimensionsVisible = true;
    // Photo dimensions show only while intake is open and the Dimensions toggle is on.
    const applyDimensions = () => {
        deps.syncSiteDimensions();
        annotationHost.hidden = intake.hidden || !dimensionsVisible;
        photoAnnotations.setVisible(!annotationHost.hidden);
        photoAnnotations.refresh(camera.project);
    };
    annotationHost.hidden = true;
    let projectId: string | null = null;
    let session = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shownBuild = '';
    let annotationBuild = '';
    let selectedPhoto: string | null = null;
    let localPhotoSelected = false;
    let photoSummary: ProjectSummary | null = null;
    let generationPending = false;
    let generationVersion = 0;
    const generationOverlay = document.createElement('div');
    generationOverlay.className = 'generation-overlay';
    generationOverlay.hidden = true;
    generationOverlay.innerHTML = '<span class="generation-spinner" aria-hidden="true"></span><p role="status">Starting modelling…</p>';
    viewport.append(generationOverlay);
    const showGeneration = (text: string | null) => {
        generationOverlay.hidden = text === null;
        viewport.classList.toggle('is-generating', text !== null);
        if (text) generationOverlay.querySelector('p')!.textContent = text;
    };
    lifetime.add(() => { generationOverlay.remove(); viewport.classList.remove('is-generating'); });
    const heading = document.querySelector<HTMLElement>('.panel-heading')!;
    const title = document.querySelector<HTMLElement>('#step-title')!;
    let originalTitle = title.innerHTML;
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'model-name-edit';
    rename.title = 'Rename model';
    rename.setAttribute('aria-label', 'Rename model');
    rename.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg>';
    rename.hidden = true;
    heading.append(rename);
    lifetime.add(() => rename.remove());
    rename.onclick = () => {
        if (title.querySelector('input')) return;
        const id = projectId;
        const previous = title.textContent ?? 'New house';
        const input = document.createElement('input');
        input.className = 'model-name-input';
        input.value = previous;
        input.maxLength = 120;
        input.setAttribute('aria-label', 'Model name');
        title.replaceChildren(input);
        input.focus(); input.select();
        let finished = false;
        const save = async () => {
            if (finished) return;
            finished = true;
            const name = input.value.trim();
            title.textContent = previous;
            if (!name || name === previous) return;
            if (!id) { title.textContent = name; return; }
            try {
                const savedName = await renameProject(id, name);
                if (projectId === id && !intake.hidden) title.textContent = savedName;
                await panel.refreshTypologies();
            } catch (error) { status.textContent = (error as Error).message; status.hidden = false; }
        };
        input.onblur = () => { void save(); };
        input.onkeydown = event => {
            if (event.key === 'Enter') { event.preventDefault(); void save(); }
            if (event.key === 'Escape') { finished = true; title.textContent = previous; }
        };
    };
    const photosPanel = createPhotosPanel(photosHost);
    lifetime.add(() => photosPanel.destroy());
    const statusPanel = createStatusPanel(statusHost, {
        runAgain: async id => { await runAgain(id); await refreshPhoto(session); },
        publish: async id => { await publish(id); await refreshPhoto(session); }
    });
    const uploadPanel = createUploadPanel(uploadHost, id => {
        generationPending = true;
        showGeneration('Starting modelling…');
        if (id) panel.setGenerating({ ...photoSummary, id, name: title.textContent ?? 'New house', photos: photoSummary?.photos ?? [], job: { state: 'queued', run: 0 } } as ProjectSummary);
        generationVersion = photoSummary?.latestBuild ?? 0;
        localPhotoSelected = false;
        if (projectId !== id) shownBuild = '';
        projectId = id;
        session++;
        if (timer) clearTimeout(timer);
        void pollPhoto(session);
    }, (id, originalUrl) => {
        selectedPhoto = id;
        localPhotoSelected = Boolean(originalUrl);
        if (originalUrl) { photosPanel.showOriginal(originalUrl); return; }
        photosPanel.update(projectId, (photoSummary?.facadePhotos ? Object.values(photoSummary.facadePhotos).flat() : photoSummary?.photos) ?? [], selectedPhoto);
    }, () => title.querySelector('input')?.value ?? title.textContent ?? 'New house');
    lifetime.add(() => uploadPanel.destroy());
    const refreshPhoto = async (token: number) => {
        const id = projectId;
        const summary = id ? await getProject(id) : null;
        if (token !== session || intake.hidden || isDisposed()) return;
        const busy = summary?.job?.state === 'queued' || summary?.job?.state === 'running';
        showGeneration(busy ? statusText(summary!) : null);
        if (busy) panel.setGenerating(summary!);
        if (generationPending && summary) {
            uploadPanel.updateProject(summary, false);
            if (summary.job?.state === 'failed') { statusPanel.update(summary); return; }
            if ((summary.latestBuild ?? 0) <= generationVersion || summary.job?.state === 'running' || summary.job?.state === 'queued'
                || summary.typology?.buildVersion !== summary.latestBuild) return;
            generationPending = false;
            selectedPhoto = null;
        }
        photoSummary = summary;
        if (summary && !title.querySelector('input')) {
            title.textContent = summary.name ?? summary.typology?.name ?? summary.id;
            rename.hidden = false;
        }
        statusPanel.update(summary);
        uploadPanel.updateProject(summary);
        if (!localPhotoSelected) photosPanel.update(id, (summary?.facadePhotos ? Object.values(summary.facadePhotos).flat() : summary?.photos) ?? [], selectedPhoto);
        if (!summary?.buildDir) return;
        const key = `${id}/${summary.buildDir}/${summary.typology?.buildVersion ?? ''}`;
        if (key !== shownBuild) {
        if (summary.typology && summary.typology.buildVersion === summary.latestBuild) {
            const loaded = await loadTypology(summary.typology.id);
            if (token !== session) return;
            await switchTypology(loaded.entry, false, loaded.typology);
            await panel.refreshTypologies();
            renderPreview(loaded.entry);
        } else {
            const baseUrl = `${fileUrl(id!, summary.buildDir)}/`;
            const response = await fetch(`${baseUrl}scene.json`);
            if (!response.ok) throw new Error('Could not load the photo model preview.');
            const manifest = await response.json() as TypologyManifest;
            if (token !== session) return;
            const typology = parseTypology(manifest, baseUrl, 'photo');
            await switchTypology({ id: typology.id, name: typology.name, source: 'photo', baseUrl, previewUrl: null }, false, typology);
        }
        }
        if (token !== session) return;
        const annotationUrl = `${activeTypology().baseUrl}annotations.json`;
        const annotationKey = `${annotationUrl}/${key}`;
        if (annotationBuild === annotationKey) return;
        const response = await fetch(annotationUrl);
        if (!response.ok) { shownBuild = key; annotationBuild = annotationKey; return; }
        const items = await response.json() as Annotation[];
        if (token !== session) return;
        const calibration = activeTypology().calibration;
        const footprint = calibration.sourceFootprint;
        const transform = (point: Annotation['start']) => ({
            x: point.x - (footprint.minX + footprint.maxX) / 2,
            y: point.y - calibration.groundY,
            z: point.z - (footprint.minZ + footprint.maxZ) / 2
        });
        photoAnnotations.set(items.map(item => ({ ...item, start: transform(item.start), end: transform(item.end) })));
        applyDimensions();
        shownBuild = key;
        annotationBuild = annotationKey;
    };
    const pollPhoto = async (token: number) => {
        try { await refreshPhoto(token); }
        catch (error) { if (token === session) { status.textContent = (error as Error).message; status.hidden = false; } }
        if (token === session && !intake.hidden && !isDisposed()) timer = setTimeout(() => void pollPhoto(token), 2000);
    };
    const closePhoto = async (id?: string) => {
        session++;
        if (timer) clearTimeout(timer);
        intake.hidden = true;
        showGeneration(null);
        rename.hidden = true;
        title.innerHTML = originalTitle;
        back.hidden = true;
        siteStep.hidden = false;
        photoAnnotations.set([]);
        applyDimensions();
        status.hidden = true;
        await deps.scene.whenSwitched();
        await setHouseVisible(true);
        if (id && id !== activeTypology().id) {
            const loaded = await loadTypology(id);
            await switchTypology(loaded.entry, false);
        }
        window.history.replaceState(null, '', typologyUrl(activeTypology().id));
    };
    back.onclick = () => { void closePhoto().catch(error => { status.textContent = (error as Error).message; status.hidden = false; }); };
    const openPhoto = async (id: string | null) => {
        if (intake.hidden) originalTitle = title.innerHTML;
        rename.hidden = false;
        if (id === null) title.textContent = 'New house';
        session++;
        if (timer) clearTimeout(timer);
        const token = session;
        projectId = id;
        shownBuild = '';
        annotationBuild = '';
        siteStep.hidden = true;
        intake.hidden = false;
        back.hidden = false;
        photoAnnotations.set([]);
        applyDimensions();
        if (id === null) {
            await setHouseVisible(false, deps.scene.house(), () => token === session);
            if (token !== session || isDisposed()) return;
        }
        selectedPhoto = null;
        localPhotoSelected = false;
        photoSummary = null;
        generationPending = false;
        uploadPanel.setProject(id);
        if (id) {
            const summary = await getProject(id);
            if (token !== session) return;
            generationPending = summary.job?.state === 'queued' || summary.job?.state === 'running';
            generationVersion = summary.typology?.buildVersion ?? 0;
            title.textContent = summary.name ?? summary.typology?.name ?? id;
            uploadPanel.setProjectDetails(summary.facadeSide, summary.width.widthMm);
            if (summary.buildDir) shownBuild = `${id}/${summary.buildDir}/${summary.typology?.buildVersion ?? ''}`;
        } else uploadPanel.setProjectDetails('back', null);
        void pollPhoto(token);
    };
    lifetime.add(panel.onPhotoIntake(id => {
        void openPhoto(id).catch(error => { status.textContent = (error as Error).message; status.hidden = false; });
    }));
    lifetime.add(() => { session++; if (timer) clearTimeout(timer); back.remove(); intake.remove(); });
    const params = new URLSearchParams(window.location.search);
    if (params.has('project') || params.get('photo') === 'new') void openPhoto(params.get('project'));

    return {
        setDimensionsVisible(visible: boolean) {
            dimensionsVisible = visible;
            applyDimensions();
        },
        destroy() {
            for (const cleanup of cleanups.splice(0).reverse()) cleanup();
        }
    };
}
