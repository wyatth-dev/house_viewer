import type { Frame } from '../shared/camera/framing.ts';
import type { Point3 } from '../shared/geometry/types.ts';
export type PhotoPair = {
    id: string;
    name: string;
    side: string;
    base: string;
    photo: string;
    width: number;
    height: number;
    scale: number;
    origin: Point3;
    right: Point3;
    out: Point3;
    points: { world: Point3; pixel: number[] }[];
};
export type PhotoMatchInput = Pick<PhotoPair, 'width' | 'height' | 'scale' | 'origin' | 'right' | 'out' | 'points'>;
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const add = (a: number[], b: number[], s = 1) => a.map((v, i) => v + b[i] * s);
function basis(p: number[]) {
    const [yaw, pitch, roll] = p;
    const out = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const r = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const u = [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch)];
    return {
        out,
        right: add(
            r.map((v) => v * Math.cos(roll)),
            u,
            Math.sin(roll)
        ),
        up: add(
            u.map((v) => v * Math.cos(roll)),
            r,
            -Math.sin(roll)
        )
    };
}
function linear(a: number[][], b: number[]) {
    const m = a.map((row, i) => [...row, b[i]]),
        n = b.length;
    for (let i = 0; i < n; i++) {
        let pivot = i;
        for (let j = i + 1; j < n; j++) if (Math.abs(m[j][i]) > Math.abs(m[pivot][i])) pivot = j;
        [m[i], m[pivot]] = [m[pivot], m[i]];
        if (Math.abs(m[i][i]) < 1e-12) return undefined;
        const d = m[i][i];
        for (let k = i; k <= n; k++) m[i][k] /= d;
        for (let j = 0; j < n; j++)
            if (j !== i) {
                const f = m[j][i];
                for (let k = i; k <= n; k++) m[j][k] -= f * m[i][k];
            }
    }
    return m.map((row) => row[n]);
}
/** Fits a pinhole camera to measured model/photo landmarks. Planar data cannot uniquely recover focal length. */
export function matchPhotoCamera(pair: PhotoMatchInput): { frame: Frame; errorPx: number; fov: number } {
    if (pair.points.length < 4) throw new Error('At least four corresponding points are required.');
    if (![pair.width, pair.height, pair.scale].every((v) => Number.isFinite(v) && v > 0))
        throw new Error('Invalid photo dimensions.');
    const vec = (p: Point3) => [p.x, p.y, p.z];
    const origin = vec(pair.origin),
        R = vec(pair.right),
        O = vec(pair.out);
    const points = pair.points.map(({ world, pixel }) => {
        const d = add(vec(world), origin, -1);
        return {
            q: [dot(d, R) / pair.scale, d[1] / pair.scale, dot(d, O) / pair.scale],
            target: [(pixel[0] - pair.width / 2) / pair.height, (pair.height / 2 - pixel[1]) / pair.height]
        };
    });
    if (points.some((p) => ![...p.q, ...p.target].every(Number.isFinite))) throw new Error('Invalid photo landmarks.');
    const hasArea = (values: number[][]) => {
        const first = values[0];
        for (let i = 1; i < values.length; i++)
            for (let j = i + 1; j < values.length; j++) {
                const a = add(values[i], first, -1),
                    b = add(values[j], first, -1);
                const area =
                    a.length === 2
                        ? Math.abs(a[0] * b[1] - a[1] * b[0])
                        : Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
                if (area > 1e-10) return true;
            }
        return false;
    };
    if (!hasArea(points.map((p) => p.q)) || !hasArea(points.map((p) => p.target)))
        throw new Error('Degenerate photo landmarks.');

    const residual = (p: number[]) => {
        const b = basis(p),
            position = [p[3], p[4], Math.exp(p[5])],
            f = Math.exp(p[6]);
        return points.flatMap(({ q, target }) => {
            const d = add(q, position, -1),
                z = -dot(d, b.out);
            if (z < 0.02) return [100 + Math.abs(z), 100 + Math.abs(z)];
            return [(f * dot(d, b.right)) / z - target[0], (f * dot(d, b.up)) / z - target[1]];
        });
    };
    const score = (r: number[]) => dot(r, r);
    let best: number[] | undefined,
        bestScore = Infinity;
    // Several focal lengths and yaw seeds avoid a frontal solution on oblique photographs.
    for (const fov of [35, 55, 75])
        for (const yaw of [-0.5, 0, 0.5]) {
            const f = 1 / (2 * Math.tan((fov * Math.PI) / 360));
            const qs = points.map((p) => p.q[0]),
                xs = points.map((p) => p.target[0]);
            const distance = Math.max(
                0.5,
                (f * (Math.max(...qs) - Math.min(...qs))) / Math.max(0.08, Math.max(...xs) - Math.min(...xs))
            );
            let p = [yaw, 0, 0, 0.5, 0.25, Math.log(distance), Math.log(f)],
                lambda = 0.001;
            let r = residual(p),
                cost = score(r);
            for (let iteration = 0; iteration < 100; iteration++) {
                const columns = p.map((_, i) => {
                    const next = [...p];
                    next[i] += 1e-5;
                    return residual(next).map((v, j) => (v - r[j]) / 1e-5);
                });
                const a = columns.map((c, i) =>
                    columns.map((d, j) => dot(c, d) + (i === j ? lambda * (dot(c, c) + 0.001) : 0))
                );
                const delta = linear(
                    a,
                    columns.map((c) => -dot(c, r))
                );
                if (!delta) break;
                const next = p.map((v, i) => v + delta[i]);
                next[0] = Math.max(-1.3, Math.min(1.3, next[0]));
                next[1] = Math.max(-1, Math.min(1, next[1]));
                next[2] = Math.max(-0.4, Math.min(0.4, next[2]));
                next[5] = Math.max(-1, Math.min(6, next[5]));
                next[6] = Math.max(Math.log(0.38), Math.min(Math.log(5), next[6]));
                const nr = residual(next),
                    nc = score(nr);
                if (nc < cost) {
                    p = next;
                    r = nr;
                    cost = nc;
                    lambda = Math.max(1e-8, lambda / 3);
                    if (Math.hypot(...delta) < 1e-7) break;
                } else lambda = Math.min(1e8, lambda * 10);
            }
            // Prefer an ordinary lens where equally good planar fits exist.
            const rank = cost + 1e-9 * Math.abs(p[6] - Math.log(1));
            if (rank < bestScore) {
                best = p;
                bestScore = rank;
            }
        }
    const p = best!,
        b = basis(p),
        distance = Math.exp(p[5]) * pair.scale;
    const global = (v: number[]) => ({ x: R[0] * v[0] + O[0] * v[2], y: v[1], z: R[2] * v[0] + O[2] * v[2] });
    const offset = global([p[3] * pair.scale, p[4] * pair.scale, distance]);
    const position = { x: origin[0] + offset.x, y: origin[1] + offset.y, z: origin[2] + offset.z };
    const out = global(b.out),
        right = global(b.right),
        up = global(b.up);
    const center = {
        x: position.x - out.x * distance,
        y: position.y - out.y * distance,
        z: position.z - out.z * distance
    };
    const tanHalfFov = 1 / (2 * Math.exp(p[6]));
    return {
        frame: {
            projection: 'perspective',
            projectionMix: 1,
            tanHalfFov,
            center,
            position,
            out,
            right,
            up,
            halfHeight: distance * tanHalfFov,
            near: 10,
            far: distance + pair.scale * 20
        },
        errorPx: Math.sqrt(score(residual(p)) / pair.points.length) * pair.height,
        fov: (2 * Math.atan(tanHalfFov) * 180) / Math.PI
    };
}
