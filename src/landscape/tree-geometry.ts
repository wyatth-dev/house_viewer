type Point = [number, number, number];
type Geometry = { positions: number[]; normals: number[]; colors: number[]; indices: number[] };
const geometry = (): Geometry => ({ positions: [], normals: [], colors: [], indices: [] });
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Point, k: number): Point => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Point, b: Point): Point => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
];
const unit = (p: Point): Point => mul(p, 1 / Math.hypot(...p));
function tube(g: Geometry, a: Point, b: Point, radius: number, tip: number) {
    const axis = unit(add(b, mul(a, -1)));
    const u = unit(cross(axis, Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const v = cross(axis, u),
        start = g.positions.length / 3,
        sides = 7;
    for (let ring = 0; ring < 2; ring++)
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2,
                normal = add(mul(u, Math.cos(angle)), mul(v, Math.sin(angle)));
            g.positions.push(...add(ring ? b : a, mul(normal, ring ? tip : radius)));
            g.normals.push(...normal);
            g.colors.push(0.09, 0.055, 0.025, 1);
        }
    for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        g.indices.push(start + i, start + j, start + sides + i, start + j, start + sides + j, start + sides + i);
    }
}
/** A deterministic shared tree: tapered branches and individual opaque leaf diamonds. */
export function treeGeometry() {
    const bark = geometry(),
        leaves = geometry();
    let seed = 721;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    for (let i = 0; i < 8; i++)
        tube(
            bark,
            [Math.sin(i * 0.5) * 0.14, i * 1.1, 0],
            [Math.sin((i + 1) * 0.5) * 0.14, (i + 1) * 1.1, 0],
            0.22 * (1 - i / 9),
            0.22 * (1 - (i + 1) / 9)
        );
    for (let tier = 0; tier < 5; tier++)
        for (let branch = 0; branch < 6; branch++) {
            const angle = (branch / 6) * Math.PI * 2 + tier * 1.7,
                y = 3 + tier * 1.05;
            const reach = (2.3 - tier * 0.24) * (0.85 + random() * 0.3);
            const a: Point = [0, y, 0],
                b: Point = [Math.cos(angle) * reach, y + 1.2, Math.sin(angle) * reach];
            const middle: Point = [b[0] * 0.5, y + 0.7, b[2] * 0.5];
            tube(bark, a, middle, 0.075 * (1 - tier * 0.1), 0.04);
            tube(bark, middle, b, 0.04, 0.012);
            for (let i = 0; i < 80; i++) {
                const theta = random() * Math.PI * 2,
                    h = random() * 2 - 1,
                    r = Math.cbrt(random());
                const radial = Math.sqrt(1 - h * h);
                const center: Point = [
                    b[0] + Math.cos(theta) * radial * r * 1.05,
                    b[1] + h * r * 0.85,
                    b[2] + Math.sin(theta) * radial * r * 1.05
                ];
                const normal = unit([random() - 0.5, 0.35 + random(), random() - 0.5]);
                const u = unit(cross(normal, [0, 0, 1])),
                    v = cross(normal, u),
                    size = 0.22 + random() * 0.14;
                const start = leaves.positions.length / 3;
                const shade = 0.8 + random() * 0.35;
                for (const offset of [mul(u, -size), mul(v, -size * 0.5), mul(u, size), mul(v, size * 0.5)]) {
                    leaves.positions.push(...add(center, offset));
                    leaves.normals.push(...normal);
                    leaves.colors.push(0.075 * shade, 0.16 * shade, 0.035 * shade, 1);
                }
                leaves.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
            }
        }
    return { bark, leaves };
}
