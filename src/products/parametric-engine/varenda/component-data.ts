import rules from './component-rules.json' with { type: 'json' };
import { varendaCatalog } from './catalog.ts';
import { buildProductionList } from './production-list.ts';
import { buildProductionRelations } from './production-relations.ts';
import type { VarendaGeometry } from './solution.ts';

export type ProductDefinition = Readonly<{
    id: string;
    manufacturerCode: string | null;
    name: string;
    kind: string;
    status: 'confirmed' | 'pending';
}>;
export type PartInstance = Readonly<{
    id: string;
    productId: string;
    geometryInstanceIds: readonly string[];
    specification: Readonly<Record<string, number | string>>;
}>;
export type ComponentNode = Readonly<
    { kind: 'assembly'; id: string; label: string; children: readonly ComponentNode[] } |
    { kind: 'part'; instanceId: string }
>;
export type ComponentData = Readonly<{
    schemaVersion: 1;
    products: readonly ProductDefinition[];
    instances: readonly PartInstance[];
    root: ComponentNode;
    relations: readonly Readonly<{ kind: 'installed-connection' | 'related'; instanceIds: readonly [string, string] }>[];
}>;

/** Containment is explicitly constructed; connection graphs never determine ownership. */
export function buildComponentData(solution: VarendaGeometry): ComponentData {
    const products: ProductDefinition[] = Object.values(varendaCatalog).map(product => {
        return { id: product.catalogProductId, manufacturerCode: product.manufacturerCode,
            name: product.name, kind: product.kind, status: product.status };
    });
    const aliases = new Map<string, string>();
    for (const gasket of solution.glazing?.gaskets ?? []) {
        const alias = rules.geometryAliases.find(rule => rule.role === gasket.role);
        const id = alias && gasket.instanceId.endsWith(alias.suffix)
            ? gasket.instanceId.slice(0, -alias.suffix.length) + alias.canonicalSuffix : gasket.instanceId;
        aliases.set(gasket.instanceId, id);
    }
    const canonical = (id: string) => aliases.get(id) ?? id;
    const instances = new Map<string, PartInstance>();
    for (const row of buildProductionList(solution)) {
        for (const geometryId of row.instanceIds) {
            const id = canonical(geometryId), existing = instances.get(id);
            if (existing && existing.productId !== row.catalogProductId) throw new Error(`Conflicting product: ${id}`);
            instances.set(id, { id, productId: row.catalogProductId,
                geometryInstanceIds: [...(existing?.geometryInstanceIds ?? []), geometryId],
                specification: row.specification });
        }
    }
    const owned = new Set<string>();
    const part = (sourceId: string): ComponentNode => {
        const instanceId = canonical(sourceId);
        if (!instances.has(instanceId)) throw new Error(`Missing component instance: ${sourceId}`);
        if (owned.has(instanceId)) throw new Error(`Duplicate containment: ${instanceId}`);
        owned.add(instanceId);
        return { kind: 'part', instanceId };
    };
    // Normalize solver records without defining their containment hierarchy.
    const capRecord = (cap: { instanceId: string }, label: string, links: readonly { endCapHoleRef: { partInstanceId: string }; fastenerInstanceId: string }[]) => ({
        ...cap, label, screws: links.filter(link => link.endCapHoleRef.partInstanceId === cap.instanceId).map(link => link.fastenerInstanceId)
    });
    const columns = solution.posts.map(post => {
        const footing = solution.footings.assemblies.find(f => f.columnId === post.columnId);
        if (!footing) throw new Error(`Missing Footplate: ${post.columnId}`);
        const links = (solution.columnFasteners?.connections ?? []).filter(c => c.columnId === post.columnId);
        return { ...post, footing,
            bottom: links.filter(c => c.partInstanceIds.includes(footing.instanceId)).flatMap(c => c.fastenerInstanceIds),
            top: links.filter(c => !c.partInstanceIds.includes(footing.instanceId)).flatMap(c => c.fastenerInstanceIds) };
    });
    const rails = Object.fromEntries(['gutter', 'wallpiece'].map(id => [id, {
        fixed: `${id}-fixed`, moving: `${id}-moving`,
        clips: (solution.ringbeamClips ?? []).filter(c => c.ownerInstanceId === `${id}-fixed`),
        gaskets: (solution.glazing?.gaskets ?? []).filter(g => g.renderOwnerInstanceId === id).map(g => g.instanceId),
        caps: (solution.endCaps?.plates ?? []).filter(c => c.railRef.instanceId === id)
            .map(c => capRecord(c, c.railRef.end === 'left' ? 'Left Cap' : 'Right Cap', solution.endCaps?.connections ?? []))
    }]));
    const rafters = (solution.rafters ?? []).map((rafter, index) => {
        const sideGaskets = (solution.glazing?.gaskets ?? []).filter(g => g.lengthAxis === 'y' &&
            solution.glazing?.installations.some(i => i.gasketInstanceId === g.instanceId && i.supportRef.instanceId === rafter.instanceId));
        return { ...rafter, label: `${rafter.bodyKind === 'end' ? 'Gable Rafter' : 'Rafter'} ${index + 1}`,
            plates: (['front', 'rear'] as const).map(end => ({ ...rafter.stands[end], label: end === 'front' ? 'Front Fixing Plate' : 'Rear Fixing Plate' })),
            caps: (solution.rafterEndCaps?.plates ?? []).filter(c => c.rafterRef.instanceId === rafter.instanceId)
                .map(c => capRecord(c, 'End Cap', solution.rafterEndCaps?.connections ?? [])),
            sides: [false, true].flatMap(mirrorX => {
                const gaskets = [...new Set(sideGaskets.filter(g => g.mirrorX === mirrorX).map(g => canonical(g.instanceId)))];
                return gaskets.length ? [{ id: `${rafter.instanceId}:${mirrorX ? 'left' : 'right'}-glazing`,
                    label: rafter.bodyKind === 'end' ? 'Inner glazing' : mirrorX ? 'Left glazing' : 'Right glazing', gaskets }] : [];
            }) };
    });
    const sources = { columns, ...rails, rafters, glass: (solution.glazing?.glass ?? []).map(panel => ({ ...panel,
        gaskets: [...new Set((solution.glazing?.installations ?? []).filter(i => i.glassRef?.instanceId === panel.instanceId)
            .map(i => canonical(i.gasketInstanceId)))] })) };
    const roots = expandRule(rules.root, sources, part, id => instances.get(canonical(id))?.productId);
    if (roots.length !== 1) throw new Error('Component rules must produce one root');
    const root = roots[0];
    for (const id of instances.keys()) if (!owned.has(id)) throw new Error(`Unowned component instance: ${id}`);
    const relations: ComponentData['relations'][number][] = [];
    const seen = new Set<string>();
    for (const [source, targets] of buildProductionRelations(solution)) for (const target of targets) {
        const pair = [canonical(source), canonical(target)].sort() as [string, string];
        if (pair[0] === pair[1]) continue;
        if (!instances.has(pair[0]) || !instances.has(pair[1])) throw new Error(`Unknown relation endpoint: ${pair.join(', ')}`);
        const key = JSON.stringify(pair);
        if (!seen.has(key)) { seen.add(key); relations.push({ kind: 'installed-connection', instanceIds: pair }); }
    }
    for (const rule of rules.relations) {
        if (!instances.has(rule.targetInstanceId)) throw new Error(`Unknown related instance: ${rule.targetInstanceId}`);
        for (const instance of instances.values()) if (instance.productId === rule.productId)
            relations.push({ kind: 'related', instanceIds: [instance.id, rule.targetInstanceId] });
    }
    return { schemaVersion: 1, products, instances: [...instances.values()], root, relations };
}

export function containedInstanceIds(node: ComponentNode): string[] {
    return node.kind === 'part' ? [node.instanceId] : node.children.flatMap(containedInstanceIds);
}

/** Resolve legacy geometry IDs through the single canonical instance registry. */
export function componentGeometryIds(id: string, data: ComponentData): readonly string[] {
    return data.instances.find(part => part.id === id || part.geometryInstanceIds.includes(id))?.geometryInstanceIds ?? [id];
}


type Rule = {
    kind: string;
    id?: string;
    label?: string;
    source?: string;
    repeat?: string;
    products?: string[];
    excludeProducts?: string[];
    children?: Rule[];
};

function readSource(path: string, context: unknown): unknown {
    return path.split('.').reduce<unknown>((value, key) => {
        if (value === null || typeof value !== 'object' || !(key in value))
            throw new Error(`Missing rule source: ${path}`);
        return (value as Record<string, unknown>)[key];
    }, context);
}

/** Generic JSON interpreter: no product- or component-specific hierarchy. */
function expandRule(rule: Rule, context: Record<string, unknown>, part: (id: string) => ComponentNode, productId: (id: string) => string | undefined): ComponentNode[] {
    if (rule.repeat) {
        const records = readSource(rule.repeat, context);
        if (!Array.isArray(records)) throw new Error(`Repeat source is not an array: ${rule.repeat}`);
        return records.flatMap((item, index) => expandRule({ ...rule, repeat: undefined }, { ...context, item, index: index + 1 }, part, productId));
    }
    if (rule.kind === 'part') {
        if (!rule.source) throw new Error('Part rule requires a source');
        const value = readSource(rule.source, context);
        return (Array.isArray(value) ? value : [value]).filter(id => {
            if (typeof id !== 'string') throw new Error(`Invalid part ID: ${rule.source}`);
            const product = productId(id);
            return (!rule.products || rule.products.includes(product ?? '')) && !rule.excludeProducts?.includes(product ?? '');
        }).map(id => {
            if (typeof id !== 'string') throw new Error(`Part source is not an instance ID: ${rule.source}`);
            return part(id);
        });
    }
    if (rule.kind !== 'assembly' || !rule.id || !rule.label || !rule.children)
        throw new Error('Invalid assembly rule');
    const interpolate = (value: string) => value.replace(/\{([^}]+)\}/g, (_match, path: string) => {
        const result = readSource(path, context);
        if (typeof result !== 'string' && typeof result !== 'number') throw new Error(`Invalid rule interpolation: ${path}`);
        return String(result);
    });
    return [{ kind: 'assembly', id: `assembly:${interpolate(rule.id)}`, label: interpolate(rule.label),
        children: rule.children.flatMap(child => expandRule(child, context, part, productId)) }];
}
