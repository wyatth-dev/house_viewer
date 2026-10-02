import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitOrthographic, fitPerspective, projectPoint } from '../src/shared/camera/framing.ts';
import { transitionFrame, projectionMatrix } from '../src/shared/camera/transition.ts';
test('mixed-lens orbit keeps the plot in frame and projected labels match the render matrix', () => {
    for (const viewport of [
        { width: 980, height: 720 },
        { width: 375, height: 490 }
    ]) {
        const bounds = { min: { x: -70, y: 0, z: -30 }, max: { x: 70, y: 19, z: 30 } };
        const from = fitPerspective(bounds, viewport, { x: 0.342, y: 0.839, z: 0.94 }, 45),
            to = fitOrthographic(bounds, viewport, { x: -1, y: 0.839, z: 0 });
        assert.equal(transitionFrame(from, to, 0, bounds, viewport), from);
        assert.equal(transitionFrame(from, to, 1, bounds, viewport), to);
        for (const progress of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) {
            const frame = transitionFrame(from, to, progress, bounds, viewport),
                m = projectionMatrix(frame, viewport);
            for (const x of [-70, 70])
                for (const y of [0, 19])
                    for (const z of [-30, 30]) {
                        const p = { x, y, z },
                            screen = projectPoint(p, frame, viewport);
                        assert.ok(screen.visible);
                        const delta = { x: x - frame.position.x, y: y - frame.position.y, z: z - frame.position.z };
                        const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
                        const cx = dot(delta, frame.right),
                            cy = dot(delta, frame.up),
                            cz = dot(delta, frame.out),
                            w = m[11] * cz + m[15];
                        assert.ok(Math.abs(screen.x - (((m[0] * cx) / w + 1) * viewport.width) / 2) < 1e-8);
                        assert.ok(Math.abs(screen.y - ((1 - (m[5] * cy) / w) * viewport.height) / 2) < 1e-8);
                        assert.ok(Math.abs((m[10] * cz + m[14]) / w) <= 1);
                    }
        }
    }
});
