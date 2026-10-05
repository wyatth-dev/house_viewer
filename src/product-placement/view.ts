import { BLEND_NORMAL, Color, Entity, StandardMaterial, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { VarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import type { ProjectPoint } from '../shared/geometry/types.ts';
import { createDimensionOverlay } from '../shared/measurements/dimension-overlay.ts';

import { getPlacementDimensionPoints, getProductParameterDimensions } from './geometry.ts';
import type { EnvelopeCorners } from './geometry.ts';
import type { CustomizableEnvelope, InstallationWallFace } from './types.ts';

export function createEnvelopeView(app: AppBase) {
    let points: Vec3[] = [];
    let visible = true;
    let destroyed = false;

    const color = new Color(0.2, 0.8, 0.65);

    // Visual lift only; the engineering elevation stays unchanged.
    const displayLiftMm = 30;
    const material = new StandardMaterial();
    material.diffuse = color.clone();
    material.emissive = color.clone().mulScalar(0.25);
    material.opacity = 0.25;
    material.blendType = BLEND_NORMAL;
    material.depthWrite = false;
    material.update();

    const fill = new Entity('Customization envelope fill');
    fill.addComponent('render', {
        type: 'plane',
        material,
        castShadows: false,
        receiveShadows: false
    });
    fill.enabled = false;
    app.root.addChild(fill);

    const draw = () => {
        if (!visible || destroyed || points.length !== 4) return;

        for (let i = 0; i < points.length; i++) {
            app.drawLine(points[i], points[(i + 1) % points.length], color, true);
        }
    };

    app.on('update', draw);

    return {
        update(corners: EnvelopeCorners) {
            if (destroyed) return;

            // Explicit perimeter order; do not rely on object field order.
            points = [corners.wallStart, corners.wallEnd, corners.outerEnd, corners.outerStart].map(
                (point) => new Vec3(point.x, point.y + displayLiftMm, point.z)
            );

            const widthDirection = new Vec3().sub2(points[1], points[0]);
            const depthDirection = new Vec3().sub2(points[3], points[0]);

            const center = new Vec3().add2(points[0], points[2]).mulScalar(0.5);

            // Keep the fill slightly below the outline.
            center.y -= 10;

            const yawDegrees = (Math.atan2(-widthDirection.z, widthDirection.x) * 180) / Math.PI;

            fill.setPosition(center);
            fill.setEulerAngles(0, yawDegrees, 0);
            fill.setLocalScale(widthDirection.length(), 1, depthDirection.length());
            fill.enabled = visible;
        },

        setOpacity(value: number) {
            if (destroyed) return;
            material.opacity = Math.max(0, Math.min(1, value));
            material.update();
        },

        setVisible(value: boolean) {
            visible = value;
            fill.enabled = !destroyed && visible && points.length === 4;
        },

        destroy() {
            if (destroyed) return;
            destroyed = true;
            app.off('update', draw);
            points = [];
            fill.destroy();
            material.destroy();
        }
    };
}

export function createAvailableAreaView(app: AppBase, reducedMotion: boolean) {
    let views: ReturnType<typeof createEnvelopeView>[] = [];
    let active = false;
    let elapsedSeconds = 0;

    const updateOpacity = () => {
        const opacity = reducedMotion ? 0.25 : 0.2 + 0.12 * Math.sin((elapsedSeconds * Math.PI * 2) / 2.4);

        for (const view of views) {
            view.setOpacity(opacity);
        }
    };

    const animate = (dt: number) => {
        if (!active || reducedMotion) return;
        elapsedSeconds += dt;
        updateOpacity();
    };

    app.on('update', animate);

    return {
        setAreas(areas: readonly EnvelopeCorners[]) {
            for (const view of views) view.destroy();

            views = areas.map((corners) => {
                const view = createEnvelopeView(app);
                view.update(corners);
                view.setVisible(active);
                return view;
            });

            updateOpacity();
        },

        setActive(value: boolean) {
            active = value;
            elapsedSeconds = 0;
            updateOpacity();

            for (const view of views) {
                view.setVisible(active);
            }
        },

        destroy() {
            app.off('update', animate);
            for (const view of views) view.destroy();
            views = [];
        }
    };
}

export function createPreviewMeasurements(
    app: AppBase,
    overlay: HTMLElement,
    project: ProjectPoint,
    readState: () =>
        | {
              wall: InstallationWallFace;
              envelope: CustomizableEnvelope;
              showWidth?: boolean;
              readOnly?: boolean;
              lockedDimensions?: ReadonlySet<'left' | 'right' | 'width' | 'wallHeight'>;
              dimensions: {
                  leftMm: number;
                  rightMm: number;
                  widthMm: number;
              };
          }
        | undefined,
    edit?: (field: 'left' | 'right' | 'width', valueMm: number) => string | undefined,
    onInteractionChange?: (active: boolean) => void,
    toggleLock?: (field: 'left' | 'right' | 'width') => void
) {
    const measurements = createDimensionOverlay(app, overlay, onInteractionChange);
    measurements.setVisible(false);

    let visible = false;
    let stateKey: string | undefined;

    const update = () => {
        const state = readState();
        const nextKey = state ? `${state.envelope.instanceId}:${state.wall.wallFaceId}` : undefined;
        if (nextKey !== stateKey) {
            measurements.setVisible(false);
            visible = false;
            stateKey = nextKey;
        }

        if (Boolean(state) !== visible) {
            visible = Boolean(state);
            measurements.setVisible(visible);
        }

        if (!state) return;

        const { wall, envelope, dimensions } = state;
        const points = getPlacementDimensionPoints(envelope, wall);

        measurements.update([
            {
                id: 'preview-left',
                label: 'Left clearance',
                start: points.wallStart,
                end: points.productStart,
                numericOnly: state.readOnly,
                valueMm: dimensions.leftMm,
                edit: !state.readOnly && edit ? (value: number) => edit('left', value) : undefined,
                locked: state.lockedDimensions?.has('left') ?? false,
                toggleLock: !state.readOnly && toggleLock ? () => { toggleLock('left'); update(); } : undefined
            },
            {
                id: 'preview-width',
                label: 'Width',
                start: points.productStart,
                end: points.productEnd,
                numericOnly: state.readOnly,
                valueMm: dimensions.widthMm,
                edit: !state.readOnly && edit ? (value: number) => edit('width', value) : undefined,
                locked: state.lockedDimensions?.has('width') ?? false,
                toggleLock: !state.readOnly && toggleLock ? () => { toggleLock('width'); update(); } : undefined
            },
            {
                id: 'preview-right',
                label: 'Right clearance',
                start: points.productEnd,
                end: points.wallEnd,
                numericOnly: state.readOnly,
                valueMm: dimensions.rightMm,
                edit: !state.readOnly && edit ? (value: number) => edit('right', value) : undefined,
                locked: state.lockedDimensions?.has('right') ?? false,
                toggleLock: !state.readOnly && toggleLock ? () => { toggleLock('right'); update(); } : undefined
            }
        ].filter((dimension) => state.showWidth !== false || dimension.id !== 'preview-width'));

        measurements.refresh(project);
    };

    app.on('update', update);

    return {
        isEditing: measurements.isEditing,
        destroy() {
            app.off('update', update);
            measurements.destroy();
        }
    };
}

/** Reuses the same click editor and lock controls as placement annotations. */
export function createProductParameterMeasurements(
    app: AppBase, overlay: HTMLElement, project: ProjectPoint,
    readState: () => { envelope: CustomizableEnvelope; wall: InstallationWallFace;
        params: VarendaParams; locked: ReadonlySet<keyof VarendaParams> } | undefined,
    edit: (key: keyof VarendaParams, valueMm: number) => string | undefined,
    toggleLock: (key: keyof VarendaParams) => void
) {
    const measurements = createDimensionOverlay(app, overlay);
    let instanceId: string | undefined;
    let visible = false;
    measurements.setVisible(false);
    const update = () => {
        const state = readState();
        if (state?.envelope.instanceId !== instanceId) {
            measurements.setVisible(false);
            instanceId = state?.envelope.instanceId;
            visible = false;
        }
        if (Boolean(state) !== visible) {
            visible = Boolean(state);
            measurements.setVisible(visible);
        }
        if (!state) return;
        measurements.update(getProductParameterDimensions(state.envelope, state.wall, state.params).map((dimension) => ({
            ...dimension, id: `product-parameter-${dimension.key}`,
            edit: (value) => edit(dimension.key, value), locked: state.locked.has(dimension.key),
            toggleLock: () => { toggleLock(dimension.key); update(); }
        })));
        measurements.refresh(project);
    };
    app.on('update', update);
    return { destroy() { app.off('update', update); measurements.destroy(); } };
}
