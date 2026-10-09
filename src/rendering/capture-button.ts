/**
 * Capture button in the middle of the canvas (Rendering step): a translucent grey-white camera.
 * Hovering it turns the whole viewport into a camera viewfinder (frame, corner marks, centre focus
 * mark, a faint white veil). Pressing it captures the view; the existing capture flash plays and
 * the new capture drops into the top of "From model".
 */
const CAMERA = `
<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
  <path d="M4 7h3.5l1.8-2.5h5.4L16.5 7H20v12H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/>
</svg>`;

/** Centre focus mark: four small corners with short ticks on the sides. */
const FOCUS = `
<svg class="viewfinder-focus" viewBox="0 0 120 80" aria-hidden="true">
  <path d="M2 14V2h12M106 2h12v12M118 66v12h-12M14 78H2V66M2 40h10M108 40h10" fill="none" stroke="currentColor" stroke-width="2.5"/>
</svg>`;

export function createCaptureButton(viewport: HTMLElement, onCapture: () => Promise<void>) {
    const finder = document.createElement('div');
    finder.className = 'viewfinder';
    finder.setAttribute('aria-hidden', 'true');
    finder.innerHTML = `<div class="viewfinder-frame"><i></i><i></i><i></i><i></i></div>${FOCUS}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'capture-button';
    button.setAttribute('aria-label', 'Capture this view');
    button.title = 'Capture this view';
    button.innerHTML = CAMERA;
    const framing = (on: boolean) => viewport.classList.toggle('framing', on);
    button.addEventListener('pointerenter', () => framing(true));
    button.addEventListener('pointerleave', () => framing(false));
    button.addEventListener('focus', () => framing(true));
    button.addEventListener('blur', () => framing(false));
    button.onclick = async () => {
        if (button.disabled) return;
        button.disabled = true;
        try {
            await onCapture();
        } finally {
            button.disabled = false;
        }
    };
    const setVisible = (visible: boolean) => {
        button.hidden = !visible;
        finder.hidden = !visible;
        if (!visible) framing(false);
    };
    setVisible(false);
    viewport.append(finder, button);
    return {
        setVisible,
        destroy() {
            framing(false);
            button.remove();
            finder.remove();
        }
    };
}
