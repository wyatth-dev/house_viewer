export type MaterialProfile = '1k' | '2k';
export type MapRole = 'baseColor' | 'normal' | 'orm';
export type MapSpec = {
    file: string;
    width: number;
    height: number;
    colorSpace: 'srgb' | 'linear';
    bytes: number;
    sha256: string;
};
export type MaterialManifest = {
    schemaVersion: 1;
    id: string;
    label: string;
    source: { provider: string; url: string; author: string; license: string; licenseUrl: string; retrievedAt: string };
    tileMeters: [number, number];
    normalConvention: 'OpenGL';
    profiles: Record<
        MaterialProfile,
        { maps: Record<MapRole, MapSpec>; downloadBytes: number; estimatedGpuBytes: number }
    >;
};
export const mapRoles: MapRole[] = ['baseColor', 'normal', 'orm'];
const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid material object');
    return value as Record<string, unknown>;
};
export function parseMaterialManifest(value: unknown): MaterialManifest {
    const item = record(value);
    if (item.schemaVersion !== 1 || item.normalConvention !== 'OpenGL')
        throw new Error('Unsupported material convention');
    if (typeof item.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || typeof item.label !== 'string')
        throw new Error('Invalid material identity');
    if (
        !Array.isArray(item.tileMeters) ||
        item.tileMeters.length !== 2 ||
        item.tileMeters.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)
    )
        throw new Error('Material tile size must be positive meters');
    const source = record(item.source);
    for (const key of ['provider', 'url', 'author', 'license', 'licenseUrl', 'retrievedAt']) {
        if (typeof source[key] !== 'string' || !source[key]) throw new Error(`Missing material provenance: ${key}`);
    }
    const profiles = record(item.profiles);
    for (const [profile, expectedSize] of [
        ['1k', 1024],
        ['2k', 2048]
    ] as const) {
        const settings = record(profiles[profile]);
        const maps = record(settings.maps);
        let bytes = 0;
        for (const role of mapRoles) {
            const map = record(maps[role]);
            if (map.width !== expectedSize || map.height !== expectedSize || map.file !== `${profile}/${role}.webp`)
                throw new Error(`Invalid ${role} map dimensions or path`);
            if (map.colorSpace !== (role === 'baseColor' ? 'srgb' : 'linear'))
                throw new Error(`Invalid ${role} color space`);
            if (
                typeof map.sha256 !== 'string' ||
                !/^[a-f0-9]{64}$/.test(map.sha256) ||
                typeof map.bytes !== 'number' ||
                !Number.isSafeInteger(map.bytes) ||
                map.bytes <= 0
            )
                throw new Error(`Invalid ${role} integrity data`);
            bytes += map.bytes;
        }
        if (settings.downloadBytes !== bytes) throw new Error('Material download budget does not match its files');
        if (settings.estimatedGpuBytes !== expectedSize * expectedSize * 16)
            throw new Error('Invalid material GPU budget');
    }
    return value as MaterialManifest;
}
