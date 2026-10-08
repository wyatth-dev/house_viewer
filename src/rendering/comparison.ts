/** Same-size images overlaid with an accessible before/after slider. */
export function openRenderComparison(beforeUrl: string, afterUrl: string) {
    const dialog = document.createElement('dialog');
    dialog.className = 'render-comparison-dialog';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
    close.onclick = () => dialog.close();
    const stage = document.createElement('div'); stage.className = 'render-comparison-stage';
    const after = document.createElement('img'); after.src = afterUrl; after.alt = 'After rendering';
    const before = document.createElement('img'); before.src = beforeUrl; before.alt = 'Before rendering'; before.className = 'render-comparison-before';
    const divider = document.createElement('div'); divider.className = 'render-comparison-divider'; divider.setAttribute('aria-hidden', 'true');
    const labels = document.createElement('div'); labels.className = 'render-comparison-labels'; labels.innerHTML = '<span>Before</span><span>After</span>';
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.value = '50'; slider.className = 'render-comparison-slider'; slider.setAttribute('aria-label', 'Before and after comparison');
    slider.oninput = () => stage.style.setProperty('--split', `${slider.value}%`);
    stage.append(after, before, divider, labels, slider); dialog.append(close, stage);
    dialog.onclose = () => dialog.remove(); document.body.append(dialog); dialog.showModal();
}
