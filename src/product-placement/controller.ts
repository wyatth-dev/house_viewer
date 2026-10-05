import type { AppBase } from 'playcanvas';

import { houseInstallationFaces } from '../scene/house/installation-faces.ts';
import type { Footprint } from '../scene/house/types.ts';
import type { Point3, ProjectPoint } from '../shared/geometry/types.ts';
import { createDimensionOverlay } from '../shared/measurements/dimension-overlay.ts';
import type { DimensionAnnotation } from '../shared/measurements/dimension-overlay.ts';
import type { Rect } from '../site-definition/types.ts';

import { calculateEnvelopeCorners, solveInstallationAreas } from './geometry.ts';
import { createPlacementPreview } from './preview.ts';
import type { CustomizableEnvelope, InstallationWallFace } from './types.ts';
import {
    createEnvelopeView,
    createAvailableAreaView,
    createPreviewMeasurements
} from './view.ts';

/** Owns the current envelope editing prototype; product placement is not connected yet. */
export function createPlacementController(
    app: AppBase,
    overlay: HTMLElement,
    footprint: Footprint,
    getProperty: () => Rect,
    project: ProjectPoint,
    viewport: HTMLElement,
    productButton: HTMLButtonElement,
    screenToGround: (x: number, y: number, groundYMm?: number) => Point3 | undefined,
    signal: AbortSignal
) {
    let placementActive = false;
    let selectedProduct: 'varenda' | undefined;
    let pointerInside = false;

    const cursorIcon = document.createElement(`div`);
    cursorIcon.className = 'placement-cursor';
    cursorIcon.hidden = true;
    cursorIcon.setAttribute('aria-hidden', 'true');
    cursorIcon.append(productButton.querySelector('.product-placeholder')!.cloneNode(true));
    viewport.append(cursorIcon);

    const feedback = document.createElement('div');
    feedback.className = 'placement-feedback';
    feedback.hidden = true;
    feedback.setAttribute('role', 'status');
    viewport.append(feedback);
    const preview = createPlacementPreview(
        app,
        houseInstallationFaces,
        getProperty,
        screenToGround,
        signal,
        (message) => {
            feedback.textContent = message ?? '';
            feedback.hidden = !message;
        }
    );

    const previewMeasurements = createPreviewMeasurements(
        app,
        overlay,
        project,
        preview.getDimensionState
    );

    const syncPlacementMode = () => {
        const placing = placementActive && selectedProduct === 'varenda';
        productButton.setAttribute('aria-pressed', String(placing));
        viewport.classList.toggle('is-placing-product', placing);
        cursorIcon.hidden = !placing || !pointerInside;
        preview.setActive(placing);
    };

    const followPointer = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;

        const bounds = viewport.getBoundingClientRect();
        pointerInside = true;
        cursorIcon.style.left = `${event.clientX - bounds.left + 16}px`;
        cursorIcon.style.top = `${event.clientY - bounds.top + 16}px`;
        syncPlacementMode();
        const canvas = viewport.querySelector('canvas')!;
        if (event.target !== canvas) {
            preview.leave();
            return;
        }
        const rect = canvas.getBoundingClientRect();
        preview.move(event.clientX - rect.left, event.clientY - rect.top);
    };

    const leaveViewport = () => {
        pointerInside = false;
        preview.leave();
        syncPlacementMode();
    };

    const cancelPlacement = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || !selectedProduct) return;

        selectedProduct = undefined;
        syncPlacementMode();
        refreshAvailableAreas();
    };

    viewport.addEventListener('pointermove', followPointer);
    viewport.addEventListener('pointerleave', leaveViewport);
    window.addEventListener('keydown', cancelPlacement);

    const availableAreas = createAvailableAreaView(app, window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const refreshAvailableAreas = () => {
        const areas = solveInstallationAreas(houseInstallationFaces, getProperty());

        availableAreas.setAreas(areas.map((area) => area.corners));
        availableAreas.setActive(placementActive && selectedProduct === 'varenda');
    };

    // Temporary preview fixture; replace with calibrated wall data later.
    const previewWall: InstallationWallFace = {
        wallFaceId: 'preview-front',
        structureId: 'house-1',
        side: 'front',
        originMm: {
            x: -footprint.width / 2,
            y: 0,
            z: footprint.depth / 2
        },
        alongWallUnit: { x: 1, z: 0 },
        outwardUnit: { x: 0, z: 1 },
        lengthMm: footprint.width
    };

    let previewEnvelope: CustomizableEnvelope = {
        instanceId: 'preview-envelope',
        productType: 'varenda',
        attachment: {
            kind: 'wall',
            structureId: previewWall.structureId,
            wallFaceId: previewWall.wallFaceId,
            alongWallOffsetMm: (previewWall.lengthMm - 4000) / 2
        },
        widthMm: 4000,
        depthMm: 2000
    };

    const envelopeView = createEnvelopeView(app);
    envelopeView.update(calculateEnvelopeCorners(previewEnvelope, previewWall));
    envelopeView.setVisible(false);
    const envelopeMeasurements = createDimensionOverlay(app, overlay);
    envelopeMeasurements.setVisible(false);

    const editEnvelope = (field: 'offset' | 'width' | 'depth', valueMm: number): string | undefined => {
        const candidate: CustomizableEnvelope = {
            ...previewEnvelope,
            attachment: {
                ...previewEnvelope.attachment,
                alongWallOffsetMm: field === 'offset' ? valueMm : previewEnvelope.attachment.alongWallOffsetMm
            },
            widthMm: field === 'width' ? valueMm : previewEnvelope.widthMm,
            depthMm: field === 'depth' ? valueMm : previewEnvelope.depthMm
        };
        try {
            const corners = calculateEnvelopeCorners(candidate, previewWall);
            const property = getProperty();
            for (const point of Object.values(corners)) {
                if (
                    point.x < property.minX ||
                    point.x > property.maxX ||
                    point.z < property.minZ ||
                    point.z > property.maxZ
                ) {
                    return 'The envelope must remain inside the property boundary.';
                }
            }
            envelopeView.update(corners);
            previewEnvelope = candidate;
            refreshEnvelopeMeasurements();
            return undefined;
        } catch (error) {
            return error instanceof Error ? error.message : 'Unable to update the envelope.';
        }
    };

    const refreshEnvelopeMeasurements = () => {
        const corners = calculateEnvelopeCorners(previewEnvelope, previewWall);
        const p = getProperty();
        const raised = (point: { x: number; y: number; z: number }) => ({ ...point, y: point.y + 80 });
        const start = raised(corners.wallStart);
        const end = raised(corners.wallEnd);
        const outer = raised(corners.outerEnd);
        const all = Object.values(corners);
        const minX = Math.min(...all.map((point) => point.x));
        const maxX = Math.max(...all.map((point) => point.x));
        const minZ = Math.min(...all.map((point) => point.z));
        const maxZ = Math.max(...all.map((point) => point.z));
        const centerX = (minX + maxX) / 2,
            centerZ = (minZ + maxZ) / 2;
        const y = start.y;
        const annotations: DimensionAnnotation[] = [
            {
                id: 'offset',
                label: 'Along wall',
                start: raised(previewWall.originMm),
                end: start,
                valueMm: previewEnvelope.attachment.alongWallOffsetMm,
                edit: (value) => editEnvelope('offset', value)
            },
            {
                id: 'width',
                label: 'Width',
                start,
                end,
                valueMm: previewEnvelope.widthMm,
                edit: (value) => editEnvelope('width', value)
            },
            {
                id: 'depth',
                label: 'Depth',
                start: end,
                end: outer,
                valueMm: previewEnvelope.depthMm,
                edit: (value) => editEnvelope('depth', value)
            },
            {
                id: 'front-gap',
                label: 'Front clearance',
                start: { x: centerX, y, z: maxZ },
                end: { x: centerX, y, z: p.maxZ },
                valueMm: p.maxZ - maxZ
            },
            {
                id: 'back-gap',
                label: 'Back clearance',
                start: { x: centerX, y, z: minZ },
                end: { x: centerX, y, z: p.minZ },
                valueMm: minZ - p.minZ
            },
            {
                id: 'left-gap',
                label: 'Left clearance',
                start: { x: minX, y, z: centerZ },
                end: { x: p.minX, y, z: centerZ },
                valueMm: minX - p.minX
            },
            {
                id: 'right-gap',
                label: 'Right clearance',
                start: { x: maxX, y, z: centerZ },
                end: { x: p.maxX, y, z: centerZ },
                valueMm: p.maxX - maxX
            }
        ];
        envelopeMeasurements.update(annotations);
        envelopeMeasurements.refresh(project);
    };
    refreshEnvelopeMeasurements();

    return {
        refresh() {
            refreshEnvelopeMeasurements();
            refreshAvailableAreas();
            preview.refresh();
        },

        setProduct(product: 'varenda' | undefined) {
            selectedProduct = product;
            syncPlacementMode();
            refreshAvailableAreas();
        },

        toggleProduct(product: 'varenda') {
            selectedProduct = selectedProduct === product ? undefined : product;
            syncPlacementMode();
            refreshAvailableAreas();
        },

        setPlacementActive(active: boolean) {
            placementActive = active;
            if (!active) selectedProduct = undefined;
            syncPlacementMode();
            refreshAvailableAreas();
        },

        refreshLabels() {
            envelopeMeasurements.refresh(project);
            preview.refresh();
        },

        setVisible(visible: boolean) {
            envelopeView.setVisible(visible);
            envelopeMeasurements.setVisible(visible);
            refreshEnvelopeMeasurements();
        },

        destroy() {
            viewport.removeEventListener('pointermove', followPointer);
            viewport.removeEventListener('pointerleave', leaveViewport);
            window.removeEventListener('keydown', cancelPlacement);
            viewport.classList.remove('is-placing-product');
            previewMeasurements.destroy();
            preview.destroy();
            feedback.remove();
            cursorIcon.remove();
            availableAreas.destroy();
            envelopeMeasurements.destroy();
            envelopeView.destroy();
        }
    };
}
