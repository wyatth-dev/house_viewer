import type { CameraController } from './types.ts';

/** Mouse-only orbit and zoom. Clicks continue to the product-placement controller. */
export function createOrbitControls(canvas: HTMLCanvasElement, camera: CameraController) {
    let pressed: { id: number; x: number; y: number; startX: number; startY: number; dragging: boolean } | undefined;
    const originalCursor = canvas.style.cursor;
    const clear = () => {
        const id = pressed?.id;
        pressed = undefined;
        canvas.style.cursor = originalCursor;
        if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    const down = (event: PointerEvent) => {
        if (event.button !== 0 || event.pointerType === 'touch' || event.ctrlKey || event.metaKey || pressed) return;
        pressed = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, dragging: false };
        canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
        if (!pressed || event.pointerId !== pressed.id) return;
        if (!pressed.dragging && Math.hypot(event.clientX - pressed.startX, event.clientY - pressed.startY) <= 5) return;
        pressed.dragging = true;
        canvas.style.cursor = 'grabbing';
        camera.orbit(-(event.clientX - pressed.x) * 0.005, (event.clientY - pressed.y) * 0.005);
        pressed.x = event.clientX;
        pressed.y = event.clientY;
        event.preventDefault();
        event.stopPropagation();
    };
    const up = (event: PointerEvent) => {
        if (!pressed || event.pointerId !== pressed.id) return;
        if (pressed.dragging) {
            event.preventDefault();
            event.stopPropagation();
        }
        clear();
    };
    const cancel = (event: PointerEvent) => {
        if (event.pointerId === pressed?.id) clear();
    };
    const wheel = (event: WheelEvent) => {
        // Leave browser zoom and trackpad pinch to the browser.
        if (event.ctrlKey || event.metaKey || !Number.isFinite(event.deltaY)) return;
        const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, canvas.clientHeight) : 1;
        camera.zoom(Math.exp(Math.max(-0.5, Math.min(0.5, event.deltaY * units * 0.0015))));
        event.preventDefault();
        event.stopPropagation();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('lostpointercapture', cancel);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return {
        destroy() {
            canvas.removeEventListener('pointerdown', down);
            canvas.removeEventListener('pointermove', move);
            canvas.removeEventListener('pointerup', up);
            canvas.removeEventListener('pointercancel', cancel);
            canvas.removeEventListener('lostpointercapture', cancel);
            canvas.removeEventListener('wheel', wheel);
            clear();
        }
    };
}
