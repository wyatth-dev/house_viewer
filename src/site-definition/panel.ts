import { getPhotoModel, listPhotoModels } from '../photo-intake/api.ts';
import type { PhotoModelSummary } from '../photo-intake/api.ts';
import { listTypologies } from '../typology/catalog.ts';
import type { TypologyEntry } from '../typology/catalog.ts';

export type WorkflowStep = 'site' | 'placement' | 'rendering';

/**
 * `projectId` is the user project being edited; photo creation stays inside this project.
 * Existing houses are opened through the project home, not listed as sibling typologies. Null lists presets only (the editor always passes the opened project).
 */
export function createPanel(host: HTMLElement, projectId: string | null) {
    const projectUrl = (photo?: string) => projectId === null ? '/'
        : `/?project=${encodeURIComponent(projectId)}${photo ? `&photo=${encodeURIComponent(photo)}` : ''}`;
    host.innerHTML = `
        <div class="panel-heading">
            <span class="eyebrow" id="step-heading">STEP 01 / SITE SETUP</span>
            <h1 id="step-title">Define your<br>property.</h1>
            <p id="step-description">Give your house room to grow.</p>
        </div>
        <fieldset id="shared-view-controls" disabled>
            <section>
                <button type="button" id="product-edit-exit" class="product-edit-back" hidden><span aria-hidden="true">←</span> Exit product edit</button>
                <button type="button" id="rendering-back" class="product-edit-back" hidden><span aria-hidden="true">←</span> Back to product placement</button>
                <button type="button" id="site-back" class="product-edit-back" hidden><span aria-hidden="true">←</span> Back to site setup</button>
                <div id="perspective-controls">
                <h2>Your perspective</h2>
                <div id="view-controls"></div>
                <p class="hint view-hint">Four fixed views. No dragging required.</p>
                </div>
                <div id="rendering-focus-section" hidden>
                    <h2>Focus on</h2>
                    <div id="rendering-focus-controls" class="view-grid" aria-label="Focus object"></div>
                </div>
            </section>
        </fieldset>
        <div id="site-step">
            <div id="property-summary"></div>
            <fieldset id="scene-controls" disabled>
                <section class="typology-section">
                    <h2><span>01</span> Typology</h2>
                    <p class="hint">Your house base model.</p>
                    <div class="typology-group">
                        <div class="typology-strip" id="typology-photo" role="group" aria-label="Create a house from a photo"></div>
                    </div>
                    <div class="typology-group preset">
                        <h3>Preset</h3>
                        <div class="typology-rail">
                            <div class="typology-strip" id="typology-builtin" role="group" aria-label="Preset base models"></div>
                        </div>
                    </div>
                </section>
                <section id="yard-dimensions-section">
                    <h2><span>02</span> Yard dimensions</h2>
                    <p class="hint">Distances from the outer wall envelope.</p>
                    <div id="dimension-controls"></div>
                </section>
                <button type="button" class="step-button" id="placement-next">Next: product placement</button>
            </fieldset>
            <div class="material-key">
                <span><i class="swatch front"></i>Front yard</span>
                <span><i class="swatch shared"></i>Side & back yards</span>
            </div>
            <p class="panel-footer">
                Yard dimensions shown in meters.<br>
                Left and right are viewed facing the front.
            </p>
        </div>
        <div id="placement-step" hidden>
            <fieldset id="placement-controls" disabled>
                <div id="placement-overview">
                
            <section>
                <details class="product-catalog" open>
                    <summary>01 · Products</summary>
                    <button
                        type="button"
                        class="product-option"
                        id="select-varenda"
                        aria-pressed="false"
                    >
                        <span class="product-placeholder" aria-hidden="true">
                            <svg viewBox="0 0 64 64" width="40" height="40">
                                <path
                                    d="M10 25 L43 16 L55 29 L22 39 Z
                                    M10 25 V49 M22 39 V56 M55 29 V46"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="3"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </span>
                        <span>Varenda</span>
                    </button>
                </details>
            </section>

            <section class="placed-products">
                <h2><span>02</span> Your products</h2>
                <p class="hint" id="products-empty">
                    No products placed yet.
                </p>
                <div id="product-instance-list"></div>
            </section>

                </div>
                <section id="placed-product-detail" hidden>
        <div id="product-customization-navigation" class="product-customization-navigation" hidden>
            <button type="button" id="product-edit-parameters" aria-pressed="true">Parameters</button>
            <button type="button" id="product-edit-parts" aria-pressed="false">Production list</button>
        </div>
                    <div id="placed-product-detail-content"></div>
                </section>
                <button type="button" class="step-button" id="rendering-next">Next: rendering</button>
            </fieldset>
        </div>
        <div id="rendering-step" hidden>
            <button type="button" id="rendering-context" class="context-bar" aria-haspopup="dialog">
                <span class="context-bar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2.5h8A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></span>
                <span class="context-bar-text"><strong>Context</strong><small id="rendering-context-count">Add photos</small></span>
                <span class="context-bar-chevron" aria-hidden="true">›</span>
            </button>
            <section id="rendering-options" class="render-options" aria-label="Look and atmosphere" hidden></section>
            <section id="rendering-photos-section" hidden>
                <h2><span>01</span> Main Perspective</h2>
                <div class="rendering-photos" id="rendering-photos"></div>
            </section>
            <section>
                <h2><span>02</span> From model</h2>
                <div id="reference-captures"></div>
                <p id="reference-capture-error" class="hint" role="alert" hidden></p>
            </section>
        </div>
    `;
    const strips = {
        builtin: host.querySelector<HTMLElement>('#typology-builtin')!,
        photo: host.querySelector<HTMLElement>('#typology-photo')!
    };
    const removeRails = [...host.querySelectorAll<HTMLElement>('.typology-rail')].map(createRail);
    const photoListeners = new Set<(photoModelId: string | null) => void>();
    const openPhoto = (photoModelId: string | null) => { for (const listener of photoListeners) listener(photoModelId); };
    const typologyListeners = new Set<(entry: TypologyEntry) => void>();
    let activeTypologyId = '';
    const cards = () => host.querySelectorAll<HTMLAnchorElement>('.typology-card[data-typology]');
    const markActive = () => {
        const current = catalog.find(entry => entry.id === activeTypologyId && entry.source === 'photo');
        strips.photo.closest<HTMLElement>('.typology-group')!.hidden = Boolean(current);

        for (const card of cards()) {
            if (card.dataset.typology === activeTypologyId) {
                card.setAttribute('aria-current', 'true');
                const strip = card.closest<HTMLElement>('.typology-strip');
                if (strip) strip.scrollTo({
                    left: Math.max(0, strip.scrollLeft + card.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - card.offsetWidth) / 2),
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
                });
            }
            else card.removeAttribute('aria-current');
        }
    };
    const select = (entry: TypologyEntry) => (event: MouseEvent) => {
        // Plain click switches the house in place; modified clicks keep the link behaviour (new tab).
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (entry.id === activeTypologyId) return;
        for (const listener of typologyListeners) listener(entry);
    };
    const pending = new Map<string, PhotoModelSummary>();
    let catalog: TypologyEntry[] = [];
    let disposed = false;
    let projectTimer: ReturnType<typeof setTimeout> | undefined;
    const previewUrls = new Map<string, string>();
    const renderTypologies = (entries: TypologyEntry[]) => {
        for (const entry of entries) {
            const previous = catalog.find(candidate => candidate.id === entry.id);
            if (previous && previous.buildVersion !== entry.buildVersion) previewUrls.delete(entry.id);
        }
        catalog = entries;
        const card = (entry: TypologyEntry) => {
            const element = typologyCard({ ...entry, previewUrl: previewUrls.get(entry.id) ?? entry.previewUrl }, projectUrl());
            element.addEventListener('click', select(entry));
            return element;
        };
        strips.builtin.replaceChildren(...entries.filter(({ source }) => source === 'builtin').map(card));
        // While a photo model is being generated the card spins and opens that model's progress.
        const generating = [...pending.keys()][0];
        const add = newFromPhotoCard(projectUrl(generating ?? 'new'), Boolean(generating));
        add.onclick = (event) => { event.preventDefault(); openPhoto(generating ?? null); };
        strips.photo.replaceChildren(...(projectId === null ? [] : [add]));
        markActive();
        for (const strip of Object.values(strips)) {
            strip.dispatchEvent(new Event('scroll'));
        }
    };
    const loadingTypologies = listTypologies(projectId).then(renderTypologies);
    const pollPhotoModels = async (pid: string) => {
        try {
            const summaries = await Promise.all((await listPhotoModels(pid)).map(mid => getPhotoModel(pid, mid)));
            if (disposed) return;
            const before = [...pending.keys()].join(',');
            pending.clear();
            for (const summary of summaries) if (summary.job?.state === 'queued' || summary.job?.state === 'running') pending.set(summary.id, summary);
            if (before !== [...pending.keys()].join(',')) renderTypologies(await listTypologies(pid));
        } catch { /* The preset catalogue remains available when the service is offline. */ }
        if (!disposed) projectTimer = setTimeout(() => void pollPhotoModels(pid), 2000);
    };
    if (projectId !== null) { const pid = projectId; void loadingTypologies.then(() => pollPhotoModels(pid)); }
    const siteStep = host.querySelector<HTMLElement>('#site-step')!;
    const placementStep = host.querySelector<HTMLElement>('#placement-step')!;
    const next = host.querySelector<HTMLButtonElement>('#placement-next')!;
    const back = host.querySelector<HTMLButtonElement>('#site-back')!;
    const renderingStep = host.querySelector<HTMLElement>('#rendering-step')!;
    const renderingNext = host.querySelector<HTMLButtonElement>('#rendering-next')!;
    const renderingBack = host.querySelector<HTMLButtonElement>('#rendering-back')!;
    const stepListeners = new Set<(step: WorkflowStep) => void>();
    const showStep = (step: WorkflowStep) => {
        const isSite = step === 'site';
        const isRendering = step === 'rendering';
        host.querySelector<HTMLElement>('#step-heading')!.textContent = isSite
            ? 'STEP 01 / SITE SETUP'
            : isRendering ? 'STEP 03 / RENDERING' : 'STEP 02 / PRODUCT PLACEMENT';
        host.querySelector<HTMLElement>('#step-title')!.innerHTML = isSite
            ? 'Define your<br>property.'
            : isRendering ? 'Preview your<br>design.' : 'Place your<br>product.';
        host.querySelector<HTMLElement>('#step-description')!.textContent = isSite
            ? 'Give your house room to grow.'
            : isRendering ? 'See your design come to life.' : 'Select a product, then choose an available area.';
        back.hidden = step !== 'placement';
        renderingBack.hidden = !isRendering;
        renderingStep.hidden = !isRendering;
        host.querySelector<HTMLElement>('#perspective-controls')!.hidden = isRendering;
        host.querySelector<HTMLElement>('#rendering-focus-section')!.hidden = !isRendering;
        siteStep.hidden = step !== 'site';
        placementStep.hidden = step !== 'placement';
        host.scrollTop = 0;
        for (const listener of stepListeners) listener(step);
        (isSite ? next : isRendering ? renderingBack : back).focus();
    };
    const goNext = () => showStep('placement');
    const goBack = () => showStep('site');
    const goRendering = () => showStep('rendering');
    renderingNext.addEventListener('click', goRendering);
    renderingBack.addEventListener('click', goNext);
    next.addEventListener('click', goNext);
    back.addEventListener('click', goBack);
    return {
        setRenderingFocusObjects(objects: { id: string; label: string }[], onFocus: (id: string) => void) {
            const group = host.querySelector<HTMLElement>('#rendering-focus-controls')!;
            group.replaceChildren(...objects.map(object => {
                const button = document.createElement('button');
                button.type = 'button'; button.textContent = object.label;
                button.setAttribute('aria-pressed', 'false');
                button.onclick = () => {
                    onFocus(object.id);
                    for (const item of group.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
                };
                return button;
            }));
        },
        /** Elements the rendering controller (src/rendering/controller.ts) fills. */
        rendering: {
            queue: host.querySelector<HTMLElement>('#reference-captures')!,
            contextButton: host.querySelector<HTMLButtonElement>('#rendering-context')!,
            contextCount: host.querySelector<HTMLElement>('#rendering-context-count')!,
            options: host.querySelector<HTMLElement>('#rendering-options')!,
            message: host.querySelector<HTMLElement>('#reference-capture-error')!
        },
        setRenderingPhotos(photos: { url: string; name: string }[]) {
            const images = photos.map(photo => {
                const image = document.createElement('img');
                image.src = photo.url;
                image.alt = photo.name;
                const card = document.createElement('div');
                card.className = 'rendering-photo';
                const camera = document.createElement('button');
                camera.type = 'button';
                camera.className = 'rendering-photo-camera';
                camera.setAttribute('aria-label', 'Use this photo as camera reference');
                camera.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 6h4l2-3h4l2 3h4v14H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
                card.append(image, camera);
                return card;
            });
            host.querySelector('#rendering-photos')!.replaceChildren(...images);
            host.querySelector<HTMLElement>('#rendering-photos-section')!.hidden = images.length === 0;
        },
        summary: host.querySelector<HTMLElement>('#property-summary')!,
        dimensions: host.querySelector<HTMLElement>('#dimension-controls')!,
        views: host.querySelector<HTMLElement>('#view-controls')!,
        /** Mark the typology shown in the scene. */
        setActiveTypology(id: string) {
            activeTypologyId = id;
            markActive();
        },
        /** Show a thumbnail on a typology's card (e.g. one just rendered). */
        async setTypologyPreview(id: string, url: string) {
            await loadingTypologies;
            previewUrls.set(id, url);
            for (const card of cards()) {
                if (card.dataset.typology !== id) continue;
                const image = card.querySelector<HTMLImageElement>('img')!;
                image.src = url;
            }
        },
        setTypologyBusy(busy: boolean) {
            for (const strip of Object.values(strips)) strip.toggleAttribute('aria-busy', busy);
        },
        setGenerating(summary: PhotoModelSummary) {
            const exists = pending.has(summary.id);
            pending.set(summary.id, summary);
            if (!exists) renderTypologies(catalog);
        },
        async refreshTypologies() { renderTypologies(await listTypologies(projectId)); },
        onPhotoIntake(listener: (photoModelId: string | null) => void) {
            photoListeners.add(listener);
            return () => { photoListeners.delete(listener); };
        },
        onSelectTypology(listener: (entry: TypologyEntry) => void) {
            typologyListeners.add(listener);
            return () => {
                typologyListeners.delete(listener);
            };
        },
        onStepChange(listener: (step: WorkflowStep) => void) {
            stepListeners.add(listener);
            return () => {
                stepListeners.delete(listener);
            };
        },
        enable() {
            for (const fieldset of host.querySelectorAll('fieldset')) fieldset.disabled = false;
        },
        destroy() {
            disposed = true;
            if (projectTimer) clearTimeout(projectTimer);
            renderingNext.removeEventListener('click', goRendering);
            renderingBack.removeEventListener('click', goNext);
            next.removeEventListener('click', goNext);
            back.removeEventListener('click', goBack);
            stepListeners.clear();
            typologyListeners.clear();
            photoListeners.clear();
            for (const remove of removeRails) remove();
            host.replaceChildren();
        }
    };
}

const PLACEHOLDER = `<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M14 40 V22 L32 9 L50 22 V40 Z M26 40 V29 H38 V40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>`;

/** One typology as a preview card. The link opens the project (new tab, no script). */
function typologyCard(entry: TypologyEntry, href: string) {
    const card = document.createElement('a');
    card.className = 'typology-card';
    card.href = href;
    card.title = entry.name;
    card.dataset.typology = entry.id;
    const thumb = document.createElement('span');
    thumb.className = 'typology-thumb';
    thumb.innerHTML = PLACEHOLDER;
    const image = document.createElement('img');
    image.alt = '';
    image.hidden = true;
    image.addEventListener('load', () => (image.hidden = false));
    image.addEventListener('error', () => (image.hidden = true));
    if (entry.previewUrl) image.src = entry.previewUrl;
    thumb.append(image);
    const name = document.createElement('span');
    name.className = 'typology-name';
    name.textContent = entry.name.replace(/^Photo · /, '');
    card.append(thumb, name);
    return card;
}

function newFromPhotoCard(href: string, generating = false) {
    const card = document.createElement('a');
    card.className = `typology-card typology-new${generating ? ' generating' : ''}`;
    card.href = href;
    card.innerHTML = generating
        ? '<span class="typology-thumb"><span class="spinner" aria-hidden="true"></span></span><span class="typology-name">Generating…</span>'
        : '<span class="typology-thumb"><span aria-hidden="true">+</span></span><span class="typology-name">New from photo</span>';
    if (generating) card.setAttribute('aria-busy', 'true');
    return card;
}

/** Horizontal scroll axis: arrow buttons appear only when the strip overflows. */
function createRail(rail: HTMLElement) {
    const strip = rail.querySelector<HTMLElement>('.typology-strip')!;
    const arrow = (direction: -1 | 1) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `typology-arrow ${direction < 0 ? 'previous' : 'next'}`;
        button.setAttribute('aria-label', direction < 0 ? 'Scroll left' : 'Scroll right');
        button.textContent = direction < 0 ? '‹' : '›';
        button.addEventListener('click', () => strip.scrollBy({ left: direction * strip.clientWidth * 0.8, behavior: 'smooth' }));
        return button;
    };
    const previous = arrow(-1),
        next = arrow(1);
    rail.append(previous, next);
    const update = () => {
        const overflow = strip.scrollWidth > strip.clientWidth + 1;
        rail.classList.toggle('overflowing', overflow);
        previous.hidden = !overflow || strip.scrollLeft <= 1;
        next.hidden = !overflow || strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
    };
    strip.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    update();
    return () => {
        strip.removeEventListener('scroll', update);
        observer.disconnect();
    };
}

export type Panel = ReturnType<typeof createPanel>;
