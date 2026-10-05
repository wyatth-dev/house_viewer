import type { VarendaGeometry } from './solution.ts';

/** Direct installed relationships only; proximity does not imply a connection. */
export function buildProductionRelations(solution: VarendaGeometry): Map<string, readonly string[]> {
    const graph = new Map<string, Set<string>>();
    const connect = (a: string, b: string) => {
        if (a === b) return;
        for (const [source, target] of [
            [a, b],
            [b, a]
        ]) {
            const targets = graph.get(source!) ?? new Set<string>();
            targets.add(target!);
            graph.set(source!, targets);
        }
    };
    for (const post of solution.posts) {
        const footing = solution.footings.assemblies.find((part) => part.columnId === post.columnId);
        if (footing) connect(post.instanceId, footing.instanceId);
    }
    for (const connection of solution.columnFasteners?.connections ?? []) {
        for (const partId of connection.partInstanceIds)
            for (const fastenerId of connection.fastenerInstanceIds) connect(partId, fastenerId);
    }
    for (const rafter of solution.rafters ?? []) {
        for (const plate of [rafter.stands.front, rafter.stands.rear]) {
            connect(rafter.instanceId, plate.instanceId);
            for (const hardware of plate.fasteners) connect(plate.instanceId, hardware.instanceId);
            for (const a of plate.fasteners) for (const b of plate.fasteners) connect(a.instanceId, b.instanceId);
        }
    }
    for (const plate of solution.rafterEndCaps?.plates ?? []) connect(plate.rafterRef.instanceId, plate.instanceId);
    for (const connection of solution.rafterEndCaps?.connections ?? []) {
        connect(connection.endCapHoleRef.partInstanceId, connection.fastenerInstanceId);
        connect(connection.rafterRef.instanceId, connection.fastenerInstanceId);
    }
    for (const connection of solution.endCaps?.connections ?? []) {
        connect(connection.endCapHoleRef.partInstanceId, connection.fastenerInstanceId);
    }
    for (const installation of solution.glazing?.installations ?? []) {
        const support = installation.supportRef.instanceId;
        const rail = support === 'gutter' || support === 'wallpiece' ? `${support}-moving` : support;
        connect(installation.gasketInstanceId, rail);
        if (installation.glassRef) connect(installation.gasketInstanceId, installation.glassRef.instanceId);
    }
    for (const connection of solution.machining?.connections ?? []) {
        const owners = [...new Set(connection.featureRefs.map(ref => ref.partInstanceId))];
        for (const owner of owners) for (const hardware of connection.fastenerInstanceIds) connect(owner, hardware);
        for (const a of owners) for (const b of owners) connect(a, b);
    }
    return new Map([...graph].map(([id, targets]) => [id, [...targets]]));
}

/** Menu ownership is directed; an installed part never owns its supporting component. */
export function buildInstallationMenus(solution: VarendaGeometry): Map<string, readonly string[]> {
    const menus = new Map<string, Set<string>>();
    const add = (owner: string, part: string) => {
        const parts = menus.get(owner) ?? new Set<string>();
        parts.add(part);
        menus.set(owner, parts);
    };
    for (const post of solution.posts) {
        const footing = solution.footings.assemblies.find((part) => part.columnId === post.columnId);
        if (footing) add(post.instanceId, footing.instanceId);
    }
    for (const connection of solution.columnFasteners?.connections ?? []) {
        for (const partId of connection.partInstanceIds)
            for (const fastenerId of connection.fastenerInstanceIds) add(partId, fastenerId);
    }
    for (const rafter of solution.rafters ?? []) {
        for (const plate of [rafter.stands.front, rafter.stands.rear]) {
            add(rafter.instanceId, plate.instanceId);
            for (const hardware of plate.fasteners) add(plate.instanceId, hardware.instanceId);
        }
    }
    for (const plate of solution.rafterEndCaps?.plates ?? []) add(plate.rafterRef.instanceId, plate.instanceId);
    for (const connection of solution.rafterEndCaps?.connections ?? [])
        add(connection.endCapHoleRef.partInstanceId, connection.fastenerInstanceId);
    for (const connection of solution.endCaps?.connections ?? [])
        add(connection.endCapHoleRef.partInstanceId, connection.fastenerInstanceId);
    for (const installation of solution.glazing?.installations ?? []) {
        const support = installation.supportRef.instanceId;
        add(
            support === 'gutter' || support === 'wallpiece' ? `${support}-moving` : support,
            installation.gasketInstanceId
        );
        if (installation.glassRef) add(installation.glassRef.instanceId, installation.gasketInstanceId);
    }
    for (const connection of solution.machining?.connections ?? [])
        for (const ref of connection.featureRefs)
            for (const hardware of connection.fastenerInstanceIds) add(ref.partInstanceId, hardware);
    return new Map([...menus].map(([id, parts]) => [id, [...parts]]));
}
