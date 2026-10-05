export function createPanel(host: HTMLElement) {
    host.innerHTML = `
        <div class="panel-heading">
            <span class="eyebrow" id="step-heading">STEP 01 / SITE SETUP</span>
            <h1 id="step-title">Define your<br>property.</h1>
            <p id="step-description">Give your house room to grow.</p>
        </div>
        <fieldset id="shared-view-controls" disabled>
            <section>
                <button type="button" id="product-edit-exit" class="product-edit-back" hidden><span aria-hidden="true">←</span> Exit product edit</button>
                <button type="button" id="site-back" class="product-edit-back" hidden><span aria-hidden="true">←</span> Back to site setup</button>
                <h2>Your perspective</h2>
                <div id="view-controls"></div>
                <p class="hint view-hint">Four fixed views. No dragging required.</p>
            </section>
        </fieldset>
        <div id="site-step">
            <div id="property-summary"></div>
            <fieldset id="scene-controls" disabled>
                <section class="typology-section">
                    <h2><span>01</span> Typology</h2>
                    <p class="hint">Your house base model.</p>
                    <figure class="typology-option" aria-label="Current base model: Fairy house">
                        <img class="typology-axon" alt="Fairy house model in axonometric view" hidden>
                        <span id="preview-status" class="hint">Generating model preview…</span>
                        <figcaption>Fairy house</figcaption>
                    </figure>
                </section>
                <section>
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
            </fieldset>
        </div>
    `;
    const siteStep = host.querySelector<HTMLElement>('#site-step')!;
    const placementStep = host.querySelector<HTMLElement>('#placement-step')!;
    const next = host.querySelector<HTMLButtonElement>('#placement-next')!;
    const back = host.querySelector<HTMLButtonElement>('#site-back')!;
    const stepListeners = new Set<(step: 'site' | 'placement') => void>();
    const showStep = (step: 'site' | 'placement') => {
        const isSite = step === 'site';
        host.querySelector<HTMLElement>('#step-heading')!.textContent = isSite
            ? 'STEP 01 / SITE SETUP'
            : 'STEP 02 / PRODUCT PLACEMENT';
        host.querySelector<HTMLElement>('#step-title')!.innerHTML = isSite
            ? 'Define your<br>property.'
            : 'Place your<br>product.';
        host.querySelector<HTMLElement>('#step-description')!.textContent = isSite
            ? 'Give your house room to grow.'
            : 'Select a product, then choose an available area.';
        back.hidden = isSite;
        siteStep.hidden = step !== 'site';
        placementStep.hidden = step !== 'placement';
        host.scrollTop = 0;
        for (const listener of stepListeners) listener(step);
        (step === 'site' ? next : back).focus();
    };
    const goNext = () => showStep('placement');
    const goBack = () => showStep('site');
    next.addEventListener('click', goNext);
    back.addEventListener('click', goBack);
    return {
        summary: host.querySelector<HTMLElement>('#property-summary')!,
        dimensions: host.querySelector<HTMLElement>('#dimension-controls')!,
        views: host.querySelector<HTMLElement>('#view-controls')!,
        showModelPreview(url: string) {
            const image = host.querySelector<HTMLImageElement>('.typology-axon')!;
            image.src = url;
            image.hidden = false;
            host.querySelector<HTMLElement>('#preview-status')!.hidden = true;
        },
        previewFailed() {
            host.querySelector<HTMLElement>('#preview-status')!.textContent = 'Model preview unavailable';
        },
        onStepChange(listener: (step: 'site' | 'placement') => void) {
            stepListeners.add(listener);
            return () => {
                stepListeners.delete(listener);
            };
        },
        enable() {
            for (const fieldset of host.querySelectorAll('fieldset')) fieldset.disabled = false;
        },
        destroy() {
            next.removeEventListener('click', goNext);
            back.removeEventListener('click', goBack);
            stepListeners.clear();
            host.replaceChildren();
        }
    };
}
