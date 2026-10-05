import { rafterDatums, railEndCapDatums } from './datums.ts';
import type { VarendaGeometry } from './solution.ts';
import type { ProductPointMm } from './varenda-solver.ts';

export type PartFeature = Readonly<{
    operationId: string;
    kind: 'hole' | 'channel';
    status: 'measured' | 'theoretical' | 'inherited-pending';
    centerMm: ProductPointMm;
    axisUnit: ProductPointMm;
    worldCenterMm: ProductPointMm;
    worldAxisUnit: ProductPointMm;
    diameterMm: number;
    extent: Readonly<{ kind: 'through'; depthMm: number }> | Readonly<{ kind: 'pending' }>;
}>;
export type FeatureRef = Readonly<{ partInstanceId: string; operationId: string }>;
export type MachiningInventory = Readonly<{
    parts: readonly Readonly<{ partInstanceId: string; features: readonly PartFeature[] }>[];
    connections: readonly Readonly<{ connectionId: string; featureRefs: readonly FeatureRef[]; fastenerInstanceIds: readonly string[] }>[];
}>;

type Frame = { position: ProductPointMm; slope?: number; mirrorX?: boolean; mirrorY?: boolean };
const subtract = (a: ProductPointMm, b: ProductPointMm) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
function rotate(p: ProductPointMm, frame: Frame, inverse = false): ProductPointMm {
    const c = Math.cos(frame.slope ?? 0), s = Math.sin(frame.slope ?? 0);
    const sx = frame.mirrorX ? -1 : 1, sy = frame.mirrorY ? -1 : 1;
    return inverse ? { x: p.x * sx, y: (p.y * c + p.z * s) * sy, z: -p.y * s + p.z * c }
        : { x: p.x * sx, y: p.y * sy * c - p.z * s, z: p.y * sy * s + p.z * c };
}

/** Part-owned operations stay separate from continuous extrusion channels and from hardware. */
export function buildMachiningInventory(solution: VarendaGeometry): MachiningInventory {
    const frames = new Map<string, Frame>();
    const features = new Map<string, PartFeature[]>();
    const connections: { connectionId: string; featureRefs: FeatureRef[]; fastenerInstanceIds: string[] }[] = [];
    const frame = (id: string, value: Frame) => { frames.set(id, value); features.set(id, []); };
    const add = (id: string, operationId: string, center: ProductPointMm, axis: ProductPointMm,
        diameterMm: number, depthMm?: number, status: PartFeature['status'] = 'measured', kind: PartFeature['kind'] = 'hole', world = false): FeatureRef => {
        const f = frames.get(id);
        if (!f) throw new Error(`Unknown feature owner: ${id}`);
        const list = features.get(id)!;
        if (list.some(p => p.operationId === operationId)) return { partInstanceId: id, operationId };
        const local = world ? rotate(subtract(center, f.position), f, true) : center;
        const localAxis = world ? rotate(axis, f, true) : axis;
        const p = rotate(local, f);
        list.push({ operationId, kind, status, centerMm: local, axisUnit: localAxis,
            worldCenterMm: { x: p.x + f.position.x, y: p.y + f.position.y, z: p.z + f.position.z },
            worldAxisUnit: rotate(localAxis, f), diameterMm,
            extent: depthMm === undefined ? { kind: 'pending' } : { kind: 'through', depthMm } });
        return { partInstanceId: id, operationId };
    };
    for (const p of solution.footings.assemblies) frame(p.instanceId, { position: p.positionMm });
    for (const p of solution.posts) {
        frame(p.instanceId, { position: p.positionMm });
        for (const h of p.holeMarkers) {
            const axis = h.faceId.startsWith('x') ? { x: h.faceId === 'x-positive' ? -1 : 1, y: 0, z: 0 }
                : { x: 0, y: h.faceId === 'y-positive' ? -1 : 1, z: 0 };
            add(p.instanceId, h.markerId, h.centerMm, axis, h.sourceDiameterMm);
        }
    }
    frame('gutter-fixed', { position: solution.gutter.positionMm });
    frame('wallpiece-fixed', { position: solution.wallPiece.positionMm });
    frame('gutter-moving', { position: solution.gutter.positionMm });
    frame('wallpiece-moving', { position: solution.wallPiece.positionMm });
    for (const c of solution.columnFasteners?.connections ?? []) {
        const ref = c.holeRefs[0]!;
        const p = solution.posts.find(p => p.instanceId === ref.partInstanceId)!;
        const h = features.get(p.instanceId)!.find(h => h.operationId === ref.operationId)!;
        const owner = c.partInstanceIds.find(id => id !== p.instanceId)!;
        const bottom = owner !== 'gutter-fixed';
        const center = bottom ? { x: h.worldCenterMm.x + h.worldAxisUnit.x * 2.5, y: h.worldCenterMm.y, z: h.worldCenterMm.z } : h.worldCenterMm;
        const counterpart = add(owner, `${p.instanceId}-${h.operationId}`, center, h.worldAxisUnit,
            bottom ? 5.5 : h.diameterMm, bottom ? 5 : undefined, 'theoretical', 'hole', true);
        connections.push({ connectionId: c.connectionId, featureRefs: [ref, counterpart], fastenerInstanceIds: [...c.fastenerInstanceIds] });
    }
    for (const p of solution.endCaps?.plates ?? []) {
        frame(p.instanceId, { position: p.positionMm, mirrorX: p.mirrorX });
        for (const h of p.holes) add(p.instanceId, h.operationId, h.centerMm, h.axisUnit, h.diameterMm, p.thicknessMm);
    }
    for (const c of solution.endCaps?.connections ?? []) {
        const cap = solution.endCaps!.plates.find(p => p.instanceId === c.endCapHoleRef.partInstanceId)!;
        const hole = features.get(cap.instanceId)!.find(h => h.operationId === c.endCapHoleRef.operationId)!;
        const owner = `${c.railRef.instanceId}-fixed`;
        const datum = c.railRef.instanceId === 'gutter' ? railEndCapDatums.gutter : railEndCapDatums.wallPiece;
        const diameter = datum.holes[0].diameterMm;
        const channel = add(owner, `${c.railRef.end}-${c.railRef.featureId}`, hole.worldCenterMm, hole.worldAxisUnit,
            diameter, undefined, 'measured', 'channel', true);
        connections.push({ connectionId: c.connectionId, featureRefs: [c.endCapHoleRef, channel], fastenerInstanceIds: [c.fastenerInstanceId] });
    }
    for (const r of solution.rafters ?? []) {
        frame(r.instanceId, { position: r.positionMm, slope: r.slopeRadians, mirrorX: r.mirrorX });
        for (const end of ['front', 'rear'] as const) {
            const stand = r.stands[end];
            frame(stand.instanceId, { position: stand.positionMm, slope: r.slopeRadians, mirrorX: stand.mirrorX, mirrorY: stand.mirrorY });
            const bore = add(stand.instanceId, 'bolt-bore', { ...rafterDatums.stand.boltAxisXYMm, z: 0 }, { x: 0, y: 0, z: -1 }, 8, 3);
            const hole = features.get(stand.instanceId)![0]!;
            const rail = end === 'front' ? 'gutter-moving' : 'wallpiece-moving';
            const slot = add(rail, 'fixing-slot', hole.worldCenterMm, hole.worldAxisUnit, 8, undefined, 'inherited-pending', 'channel', true);
            connections.push({ connectionId: `${stand.instanceId}-connection`, featureRefs: [bore, slot], fastenerInstanceIds: stand.fasteners.map(h => h.instanceId) });
        }
    }
    for (const p of solution.rafterEndCaps?.plates ?? []) {
        frame(p.instanceId, { position: p.positionMm, slope: p.slopeRadians, mirrorX: p.mirrorX });
        for (const h of p.holes) add(p.instanceId, h.operationId, h.centerMm, h.axisUnit, h.diameterMm, p.thicknessMm);
    }
    for (const c of solution.rafterEndCaps?.connections ?? []) {
        const hole = features.get(c.endCapHoleRef.partInstanceId)!.find(h => h.operationId === c.endCapHoleRef.operationId)!;
        const channel = add(c.rafterRef.instanceId, c.rafterRef.featureId, hole.worldCenterMm, hole.worldAxisUnit,
            3.6, undefined, c.featureStatus, 'channel', true);
        connections.push({ connectionId: c.connectionId, featureRefs: [c.endCapHoleRef, channel], fastenerInstanceIds: [c.fastenerInstanceId] });
    }
    for (const glass of solution.glazing?.glass ?? []) frame(glass.instanceId, { position: glass.positionMm, slope: glass.slopeRadians });
    for (const gasket of solution.glazing?.gaskets ?? []) frame(gasket.instanceId, { position: gasket.positionMm });
    const fastenerIds = [
        ...(solution.columnFasteners?.fasteners ?? []).map(h => h.instanceId),
        ...(solution.endCaps?.fasteners ?? []).map(h => h.instanceId),
        ...(solution.rafterEndCaps?.fasteners ?? []).map(h => h.instanceId),
        ...(solution.rafters ?? []).flatMap(r => [r.stands.front, r.stands.rear].flatMap(p => p.fasteners.map(h => h.instanceId)))
    ];
    const inventory = { parts: [...features].map(([partInstanceId, features]) => ({ partInstanceId, features })), connections };
    validateMachiningReferences(inventory, fastenerIds);
    return inventory;
}

export function validateMachiningReferences(inventory: MachiningInventory, fastenerIds?: readonly string[]) {
    const allowed = fastenerIds ? new Set(fastenerIds) : undefined;
    if (allowed && allowed.size !== fastenerIds!.length) throw new Error('Duplicate physical fastener');
    const referenced = new Set<string>();
    const keys = new Set<string>();
    for (const part of inventory.parts) for (const f of part.features) {
        const key = `${part.partInstanceId}/${f.operationId}`;
        if (keys.has(key)) throw new Error(`Duplicate feature: ${key}`);
        keys.add(key);
        if (!Object.values(f.centerMm).every(Number.isFinite) || !Number.isFinite(f.diameterMm) || f.diameterMm <= 0) throw new Error(`Invalid feature: ${key}`);
    }
    const ids = new Set<string>();
    for (const c of inventory.connections) {
        if (ids.has(c.connectionId)) throw new Error(`Duplicate connection: ${c.connectionId}`);
        ids.add(c.connectionId);
        for (const id of c.fastenerInstanceIds) {
            if (allowed && !allowed.has(id)) throw new Error('Unresolved fastener reference');
            referenced.add(id);
        }
        for (const ref of c.featureRefs) if (!keys.has(`${ref.partInstanceId}/${ref.operationId}`)) throw new Error('Unresolved hole reference');
    }
    if (allowed && [...allowed].some(id => !referenced.has(id))) throw new Error('Unconnected fastener');
}
