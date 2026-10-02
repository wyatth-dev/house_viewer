import { glassDatums, roofJointDatums } from './datums.ts';
import { varendaCatalog } from './catalog.ts';
import { solveRafters, solveGutterLayout, solveWallPieceLayout } from './varenda-solver.ts';
import type { GlassInstance, GasketInstance, GasketInstallation, ProductPointMm } from './varenda-solver.ts';
import type { VarendaParams } from './parameters.ts';

export type GlazingSolution = Readonly<{
    glass: readonly GlassInstance[];
    gaskets: readonly GasketInstance[];
    installations: readonly GasketInstallation[];
}>;

/** Independent engineering instances; neighboring panels share rail gaskets by reference. */
export function solveGlazing(
    params: Readonly<VarendaParams>,
    rafters: ReturnType<typeof solveRafters> = solveRafters(params)
): GlazingSolution {
    const glass: GlassInstance[] = [], gaskets: GasketInstance[] = [];
    const installations: GasketInstallation[] = [];
    if (rafters.length < 2) throw new Error('Glazing requires at least two rafters');
    const ids = new Set(rafters.map(r => r.instanceId));
    if (ids.size !== rafters.length) throw new Error('Duplicate rafter identity');
    const angle = rafters[0].slopeRadians, c = Math.cos(angle), s = Math.sin(angle);
    const offset = (p: ProductPointMm, along: number, normal: number): ProductPointMm => ({
        x: p.x, y: p.y + c * along - s * normal, z: p.z + s * along + c * normal
    });
    for (const r of rafters) {
        if (!Number.isFinite(r.slopeRadians) || Math.abs(r.slopeRadians - angle) > 1e-8 ||
            ![...Object.values(r.frontMm), ...Object.values(r.rearMm), r.lengthMm].every(Number.isFinite) || r.lengthMm <= 0 ||
            Math.abs((r.rearMm.y-r.frontMm.y)*c+(r.rearMm.z-r.frontMm.z)*s-r.lengthMm)>0.001 ||
            Math.abs(r.frontMm.y-rafters[0].frontMm.y)>0.001 || Math.abs(r.frontMm.z-rafters[0].frontMm.z)>0.001 ||
            Math.abs(r.rearMm.y-rafters[0].rearMm.y)>0.001 || Math.abs(r.rearMm.z-rafters[0].rearMm.z)>0.001) {
            throw new Error('Glazing rafters must share finite roof endpoints and slope');
        }
    }
    const sideRoles = [
        ['support', varendaCatalog.glazingSupportGasket],
        ['wedge-a', varendaCatalog.glazingWedgeGasketA],
        ['wedge-b', varendaCatalog.glazingWedgeGasketB]
    ] as const;
    for (let i = 0; i < rafters.length - 1; i++) {
        const left = rafters[i], right = rafters[i + 1];
        if (left.frontMm.x >= right.frontMm.x || (left.bodyKind==='end' && left.mirrorX) ||
            (right.bodyKind==='end' && !right.mirrorX)) throw new Error('Glass bay must face inward between ordered rafters');
        const low = left.frontMm.x + (left.bodyKind === 'end' ? glassDatums.edgeOffsetMm.endRafter : glassDatums.edgeOffsetMm.regularRafter);
        const high = right.frontMm.x - (right.bodyKind === 'end' ? glassDatums.edgeOffsetMm.endRafter : glassDatums.edgeOffsetMm.regularRafter);
        const front = glassDatums.endOffsetFromRafterMm.front, rear = glassDatums.endOffsetFromRafterMm.rear;
        const lengthMm = left.lengthMm + rear - front;
        if (high <= low || lengthMm <= 0) throw new Error('Glass bay has non-positive dimensions');
        const instanceId = `glass-${left.instanceId}-${right.instanceId}`;
        const center = offset(left.frontMm, front + lengthMm / 2,
            glassDatums.undersideNormalOffsetMm + glassDatums.thicknessMm / 2);
        glass.push({ instanceId, displayNumber: `G-${String(i+1).padStart(3,'0')}`,
            catalogProductId: varendaCatalog.glassPanel.catalogProductId,
            bayRef: { leftRafterInstanceId: left.instanceId, rightRafterInstanceId: right.instanceId },
            positionMm: { ...center, x: (low+high)/2 }, slopeRadians: angle,
            widthMm: high-low, lengthMm, thicknessMm: glassDatums.thicknessMm });
        for (const [edge, rafter, mirrorX] of [['left',left,false],['right',right,true]] as const) {
            for (const [role, product] of sideRoles) {
                const gasketInstanceId = `gasket-${rafter.instanceId}-${mirrorX ? 'negative-x' : 'positive-x'}-${role}`;
                // Actual cut length follows the rafter; glass overhang does not extend these strips.
                gaskets.push({ instanceId: gasketInstanceId, catalogProductId: product.catalogProductId, role,
                    positionMm: offset(rafter.frontMm,rafter.lengthMm/2,0), slopeRadians: angle,
                    mirrorX, mirrorY: false, lengthAxis: 'y', lengthMm: rafter.lengthMm });
                installations.push({ installationId: `${instanceId}-${edge}-${role}`, gasketInstanceId, role,
                    glassRef: { instanceId, edge }, supportRef: { instanceId: rafter.instanceId,
                        feature: { status: 'confirmed', featureId: `glazing-${mirrorX?'negative-x':'positive-x'}-${role}` } } });
            }
        }
    }
    for (const [railId,layout,joint,roles] of [
        ['gutter',solveGutterLayout(params),roofJointDatums.gutter,['seal']],
        ['wallpiece',solveWallPieceLayout(params),roofJointDatums.wallPiece,['seal','support','top-seal']]
    ] as const) {
        const rotatedPivot = offset({x:0,y:0,z:0},joint.pivotMm.y,joint.pivotMm.z);
        const positionMm = { x: layout.positionMm.x,
            y: layout.positionMm.y+joint.pivotMm.y-rotatedPivot.y,
            z: layout.positionMm.z+joint.pivotMm.z-rotatedPivot.z };
        for (const role of roles) {
            const product = role==='support' ? varendaCatalog.glazingSupportGasket :
                role==='top-seal' ? varendaCatalog.wallPlateTopSealGasket : varendaCatalog.glazingSealGasket;
            const gasketInstanceId = `gasket-${railId}-${role}`;
            gaskets.push({instanceId:gasketInstanceId,catalogProductId:product.catalogProductId,role,
                renderOwnerInstanceId:railId,positionMm,slopeRadians:angle,mirrorX:false,mirrorY:false,
                lengthAxis:'x',lengthMm:layout.lengthMm});
            const supportRef = {instanceId:railId,feature:{status:'confirmed' as const,featureId:`swivel-${role}`}};
            if(role==='top-seal') installations.push({installationId:`${railId}-${role}`,gasketInstanceId,role,supportRef});
            else for(const panel of glass) installations.push({installationId:`${panel.instanceId}-${railId}-${role}`,
                gasketInstanceId,role,supportRef,glassRef:{instanceId:panel.instanceId,edge:railId==='gutter'?'front':'rear'}});
        }
    }
    return {glass,gaskets,installations};
}

/** Exact dimension groups, with separate instance IDs and unique quantities/total cut lengths. */
export function summarizeGlazingParts(solution: GlazingSolution) {
    const groups = new Map<string, {catalogProductId:string;quantity:number;instanceIds:string[];
        widthMm?:number;lengthMm:number;thicknessMm?:number;totalLengthMm:number;areaMm2?:number}>();
    const seen = new Set<string>();
    for (const part of [...solution.glass,...solution.gaskets]) {
        if(seen.has(part.instanceId)) continue;
        seen.add(part.instanceId);
        const panel = 'widthMm' in part ? part : undefined;
        const key = JSON.stringify([part.catalogProductId,panel?.widthMm,part.lengthMm,panel?.thicknessMm]);
        const group = groups.get(key) ?? {catalogProductId:part.catalogProductId,quantity:0,instanceIds:[],
            widthMm:panel?.widthMm,lengthMm:part.lengthMm,thicknessMm:panel?.thicknessMm,totalLengthMm:0,
            areaMm2:panel ? 0 : undefined};
        group.quantity++;group.instanceIds.push(part.instanceId);group.totalLengthMm+=part.lengthMm;
        if(panel) group.areaMm2!+=panel.widthMm*panel.lengthMm;
        groups.set(key,group);
    }
    return [...groups.values()];
}
