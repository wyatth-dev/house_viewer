type Point = [number, number, number];
type Edge = { start: Point; end: Point; normals: Point[] };

/** Weld position seams before discarding flat triangulation edges. Coordinates are millimeters. */
export function extractCreaseEdges(positions: number[], indices: number[], angleDegrees = 25): Edge[] {
    const edges = new Map<string, Edge>();
    const point = (i: number): Point => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const key = (p: Point) => p.map((v) => Math.round(v * 100)).join(',');
    for (let i = 0; i + 2 < indices.length; i += 3) {
        const triangle = [point(indices[i]), point(indices[i + 1]), point(indices[i + 2])];
        const [a, b, c] = triangle;
        const u = b.map((v, j) => v - a[j]),
            v = c.map((value, j) => value - a[j]);
        const normal: Point = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const length = Math.hypot(...normal);
        if (length < 1e-8) continue;
        for (let j = 0; j < 3; j++) normal[j] /= length;
        for (let j = 0; j < 3; j++) {
            const start = triangle[j],
                end = triangle[(j + 1) % 3];
            const edgeKey = [key(start), key(end)].sort().join('|');
            const edge = edges.get(edgeKey);
            if (edge) edge.normals.push(normal);
            else edges.set(edgeKey, { start, end, normals: [normal] });
        }
    }
    const threshold = Math.cos((angleDegrees * Math.PI) / 180);
    return [...edges.values()].filter(
        ({ normals }) =>
            normals.length === 1 ||
            normals.some((n) =>
                normals.some((other) => Math.abs(n[0] * other[0] + n[1] * other[1] + n[2] * other[2]) < threshold)
            )
    );
}
