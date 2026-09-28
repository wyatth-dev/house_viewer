export function createPanel(host: HTMLElement) {
    host.innerHTML = `<div class="panel-heading"><span class="eyebrow">STEP 01 / SITE SETUP</span><h1>Define your<br>property.</h1><p>Give your house room to grow.</p></div><div id="property-summary"></div><fieldset id="scene-controls" disabled><section class="typology-section"><h2><span>01</span> Typology</h2><p class="hint">Your house base model.</p><figure class="typology-option" aria-label="Current base model: Fairy house"><img class="typology-axon" alt="Fairy house model in axonometric view" hidden><span id="preview-status" class="hint">Generating model preview…</span><figcaption>Fairy house</figcaption></figure></section><section><h2><span>02</span> Your perspective</h2><div id="view-controls"></div><p class="hint view-hint">Four fixed views. No dragging required.</p></section><section><h2><span>03</span> Yard dimensions</h2><p class="hint">Distances from the outer wall envelope.</p><div id="dimension-controls"></div></section></fieldset><div class="material-key"><span><i class="swatch front"></i>Front yard</span><span><i class="swatch shared"></i>Side & back yards</span></div><p class="panel-footer">All measurements in meters.<br>Left and right are viewed facing the front.</p>`;
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
        enable() {
            host.querySelector('fieldset')!.disabled = false;
        },
        destroy() {
            host.replaceChildren();
        }
    };
}
