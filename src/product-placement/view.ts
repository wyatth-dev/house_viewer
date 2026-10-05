import { BLEND_NORMAL, Color, Entity, StandardMaterial, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { EnvelopeCorners } from './geometry.ts';

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
