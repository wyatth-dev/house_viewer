import { varendaCatalog } from './catalog.ts';
import { rafterDatums } from './datums.ts';
import type { VarendaGeometry } from './solution.ts';
import type { InstalledFastener } from './varenda-solver.ts';

export type { InstalledFastener } from './varenda-solver.ts';
export type ProductionRow = Readonly<{
    id: string;
    catalogProductId: string;
    label: string;
    category: string;
    material: string;
    specification: Readonly<Record<string, number | string>>;
    quantity: number;
    instanceIds: readonly string[];
}>;

/** Both nut and bolt reference the same actual fixing-plate bore. */
export function getInstalledFasteners(solution: VarendaGeometry): InstalledFastener[] {
    const installed: InstalledFastener[] = [
        ...(solution.endCaps?.fasteners ?? []),
        ...(solution.rafterEndCaps?.fasteners ?? []),
        ...(solution.columnFasteners?.fasteners ?? [])
    ];
    for (const rafter of solution.rafters ?? []) {
        const c = Math.cos(rafter.slopeRadians),
            s = Math.sin(rafter.slopeRadians);
        for (const stand of [rafter.stands.front, rafter.stands.rear]) {
            const localY = rafterDatums.stand.boltAxisXYMm.y * (stand.mirrorY ? -1 : 1);
            const positionMm = {
                x: stand.positionMm.x + rafterDatums.stand.boltAxisXYMm.x * (stand.mirrorX ? -1 : 1),
                y: stand.positionMm.y + localY * c,
                z: stand.positionMm.z + localY * s
            };
            for (const hardware of stand.fasteners)
                installed.push({ ...hardware, positionMm, axisUnit: { x: 0, y: -s, z: c } });
        }
    }
    return installed.map(hardware => {
        const offset = hardware.modelOffsetMm ?? 0;
        const range: readonly [number, number] = hardware.catalogProductId === 'varenda-rafter-stand-bolt'
            ? [-11.5, 8.5] : hardware.catalogProductId === 'varenda-rafter-stand-nut' ? [0, 6.6666667] : [0, 16];
        return { ...hardware, axialExtentMm: [offset + range[0], offset + range[1]] as const };
    });
}

const pendingLabels: Record<string, string> = {
    'varenda-footplate': 'Footplate assembly',
    'varenda-post-profile': 'Post',
    'varenda-gutter-fixed': 'Gutter · fixed profile',
    'varenda-gutter-moving': 'Gutter · moving profile',
    'varenda-wallpiece-fixed': 'Wall plate · fixed profile',
    'varenda-wallpiece-moving': 'Wall plate · moving profile',
    'varenda-rafter-regular': 'Rafter',
    'varenda-rafter-end': 'End rafter',
    'varenda-glass-panel': 'Roof glass'
};
export function buildProductionList(solution: VarendaGeometry): ProductionRow[] {
    const counts = new Map((solution.machining?.parts ?? []).map(p => [p.partInstanceId, {
        holeCount: p.features.filter(f => f.kind === 'hole').length,
        channelCount: p.features.filter(f => f.kind === 'channel').length,
        pendingHoleDepthCount: p.features.filter(f => f.kind === 'hole' && f.extent.kind === 'pending').length
    }]));
    const groups = new Map<string, { row: Omit<ProductionRow, 'quantity' | 'instanceIds'>; ids: Set<string> }>();
    const add = (
        catalogProductId: string,
        instanceId: string,
        category: string,
        specification: Record<string, number | string> = { detail: 'Specification pending' }
    ) => {
        const featureCounts = counts.get(instanceId);
        if (featureCounts) specification = { ...specification, ...featureCounts };
        const material =
            catalogProductId === 'varenda-rafter-stand-nut' || catalogProductId === 'fastener-m6-16-din7500c-a2-v1'
                ? 'Stainless steel A2'
                : catalogProductId === 'varenda-rafter-stand-bolt'
                  ? 'Class 8.8 steel'
                  : 'Material pending';
        const id = JSON.stringify([catalogProductId, material, specification]);
        const catalog = Object.values(varendaCatalog).find((p) => p.catalogProductId === catalogProductId);
        const group = groups.get(id) ?? {
            row: {
                id,
                catalogProductId,
                label: catalog
                    ? catalog.manufacturerCode ? `${catalog.manufacturerCode} - ${catalog.name}` : catalog.name
                    : pendingLabels[catalogProductId] ?? catalogProductId,
                category,
                material,
                specification
            },
            ids: new Set<string>()
        };
        group.ids.add(instanceId);
        groups.set(id, group);
    };
    for (const part of solution.footings.assemblies) add(part.catalogProductId, part.instanceId, 'Structure');
    for (const part of solution.ringbeamClips ?? [])
        add(part.catalogProductId, part.instanceId, 'Profiles', { lengthMm: part.lengthMm });
    for (const part of solution.posts)
        add(part.catalogProductId, part.instanceId, 'Profiles', { lengthMm: part.lengthMm });
    for (const [rail, layout] of [
        ['gutter', solution.gutter],
        ['wallpiece', solution.wallPiece]
    ] as const) {
        for (const kind of ['fixed', 'moving'])
            add(`varenda-${rail}-${kind}`, `${rail}-${kind}`, 'Profiles', { lengthMm: layout.lengthMm });
    }
    for (const rafter of solution.rafters ?? []) {
        add(`varenda-rafter-${rafter.bodyKind}`, rafter.instanceId, 'Profiles', { lengthMm: rafter.lengthMm });
        for (const plate of [rafter.stands.front, rafter.stands.rear])
            add(plate.catalogProductId, plate.instanceId, 'Plates', { widthMm: 80, depthMm: 28.5, thicknessMm: 3 });
    }
    for (const part of [...(solution.endCaps?.plates ?? []), ...(solution.rafterEndCaps?.plates ?? [])])
        add(part.catalogProductId, part.instanceId, 'Plates', { thicknessMm: part.thicknessMm });
    for (const part of solution.glazing?.glass ?? [])
        add(part.catalogProductId, part.instanceId, 'Glass', {
            widthMm: part.widthMm,
            lengthMm: part.lengthMm,
            thicknessMm: part.thicknessMm
        });
    for (const part of solution.glazing?.gaskets ?? [])
        add(part.catalogProductId, part.instanceId, 'Gaskets', { lengthMm: part.lengthMm });
    for (const part of getInstalledFasteners(solution))
        add(
            part.catalogProductId,
            part.instanceId,
            'Fasteners',
            part.catalogProductId === 'fastener-wafer-head-self-drilling-4-2-16'
                ? { diameterMm: 4.2, lengthMm: 16 }
                : part.catalogProductId === 'fastener-m6-16-din7500c-a2-v1'
                  ? { thread: 'M6', lengthMm: 16, standard: 'DIN 7500C' }
                  : part.catalogProductId === 'varenda-rafter-stand-nut'
                    ? { thread: 'M8' }
                    : { detail: 'Size pending' }
        );
    return [...groups.values()].map(({ row, ids }) => ({ ...row, quantity: ids.size, instanceIds: [...ids] }));
}
