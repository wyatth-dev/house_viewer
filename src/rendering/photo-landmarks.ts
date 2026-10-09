import type { TypologyManifest } from '../typology/index.ts';

import type { PhotoMatchInput } from './photo-match.ts';

// The published intake schema is runtime validated below; its fields are heterogeneous.
/* eslint-disable @typescript-eslint/no-explicit-any */
function record(value: unknown): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid photo matching spec.');
    return value as Record<string, any>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
function inverse(value: unknown): number[][] {
    if (
        !Array.isArray(value) ||
        value.length !== 3 ||
        value.some((row) => !Array.isArray(row) || row.length !== 3 || !row.every(Number.isFinite))
    )
        throw new Error('Invalid rectification homography.');
    const [a, b, c, d, e, f, g, h, i] = value.flat() as number[];
    const co = [
        [e * i - f * h, c * h - b * i, b * f - c * e],
        [f * g - d * i, a * i - c * g, c * d - a * f],
        [d * h - e * g, b * g - a * h, a * e - b * d]
    ];
    const det = a * co[0][0] + b * co[1][0] + c * co[2][0];
    const norm = Math.max(...(value.flat() as number[]).map(Math.abs));
    if (!Number.isFinite(det) || norm === 0 || Math.abs(det) <= 1e-14 * norm ** 3)
        throw new Error('Singular rectification homography.');
    return co.map((row) => row.map((v) => v / det));
}
/** Rectified opening boxes become original-photo pixels and centered published model landmarks. */
export function buildPhotoMatchInput(
    spec: unknown,
    manifest: TypologyManifest,
    photoFile: string,
    size: { width: number; height: number }
): PhotoMatchInput {
    const s = record(spec);
    if (![size.width, size.height].every((v) => Number.isFinite(v) && v > 0))
        throw new Error('Invalid photo dimensions.');
    const matches = Object.entries(record(s.photos)).filter(([, v]) => record(v).file === photoFile);
    if (matches.length !== 1) throw new Error('Photo must identify exactly one measured source photo.');
    const [photoId, photo] = matches[0];
    if (s.facades) throw new Error('Multiple facade specs are not supported for photo matching.');
    const facade = record(s.facade),
        w = facade.widthMm,
        depth = record(s.massing).depthMm;
    if (![w, depth].every((v) => Number.isFinite(v) && v > 0)) throw new Error('Invalid facade dimensions.');
    const cal = manifest.calibration,
        fp = cal?.sourceFootprint;
    if (
        !fp ||
        ![fp.minX, fp.maxX, fp.minZ, fp.maxZ, cal.groundY].every(Number.isFinite) ||
        fp.maxX <= fp.minX ||
        fp.maxZ <= fp.minZ ||
        cal.yawDegrees !== 0 ||
        manifest.units !== 'mm' ||
        manifest.axes?.up !== '+Y' ||
        manifest.axes?.front !== '+Z'
    )
        throw new Error('Unsupported model calibration.');
    const side = facade.side;
    if (!['front', 'back', 'left', 'right'].includes(side)) throw new Error('Unsupported facade side.');
    const world = (u: number, y: number) => {
        const [x, z] =
            side === 'front'
                ? [u - w, 0]
                : side === 'back'
                  ? [-u, -depth]
                  : side === 'left'
                    ? [-depth, u - w]
                    : [0, -u];
        return { x: x - (fp.minX + fp.maxX) / 2, y: y - cal.groundY, z: z - (fp.minZ + fp.maxZ) / 2 };
    };
    const inv = inverse(record(photo.rectification).homography);
    const pixel = (x: number, y: number) => {
        const v = inv.map((row) => row[0] * x + row[1] * y + row[2]);
        if (Math.abs(v[2]) < 1e-12) throw new Error('Photo landmark projects to infinity.');
        const p = [v[0] / v[2], v[1] / v[2]];
        if (!p.every(Number.isFinite)) throw new Error('Invalid photo landmarks.');
        return p;
    };
    if (!Array.isArray(facade.openings)) throw new Error('Missing facade opening landmarks.');
    const measurements = record(s.measurements);
    const points: PhotoMatchInput['points'] = [];
    for (const opening of facade.openings) {
        const measure = measurements[opening.evidence?.measurement];
        if (!measure || measure.photo !== photoId || measure.kind !== 'box') continue;
        const px = measure.px;
        if (!Array.isArray(px) || px.length !== 4 || !px.every(Number.isFinite) || px[2] <= px[0] || px[3] <= px[1])
            throw new Error('Degenerate measured opening box.');
        const { uMm: u, widthMm: ow, sillMm: sill, heightMm: height } = opening;
        if (![u, ow, sill, height].every(Number.isFinite) || ow <= 0 || height <= 0)
            throw new Error('Invalid opening landmark dimensions.');
        const [x0, y0, x1, y1] = px;
        for (const [x, y, mu, my] of [
            [x0, y0, u - ow / 2, sill + height],
            [x1, y0, u + ow / 2, sill + height],
            [x1, y1, u + ow / 2, sill],
            [x0, y1, u - ow / 2, sill]
        ])
            points.push({ world: world(mu, my), pixel: pixel(x, y) });
    }
    if (points.length < 4) throw new Error('At least four measured opening landmarks are required for this photo.');
    const origin = world(0, 0),
        end = world(w, 0);
    const right = { x: (end.x - origin.x) / w, y: 0, z: (end.z - origin.z) / w };
    const out = { x: -right.z || 0, y: 0, z: right.x };
    return { ...size, scale: w, origin, right, out, points };
}
