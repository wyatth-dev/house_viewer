import type { VarendaParams } from '../products/parametric-engine/varenda/parameters.ts';

export class ProjectFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProjectFormatError';
    }
}

export type Representation = 'white' | 'color-block' | 'render';

export type ProductRecord = {
    instanceId: string;
    productType: string;
    name: string;
    attachment: { wallFaceId: string; alongWallOffsetMm: number };
    params: VarendaParams;
    lockedDimensions: string[];
    lockedParameters: string[];
};

export type ProjectDocument = {
    schemaVersion: 1;
    id: string;
    name: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    house: { source: 'preset' | 'photo'; typologyId: string };
    site: { dimensionsMm: { front: number; back: number; left: number; right: number } };
    display: { representation: Representation; trees: boolean; fence: boolean; dimensions: boolean };
    products: ProductRecord[];
    media: { renders: unknown[]; references: unknown[] };
};

type Rec = Record<string, unknown>;

function fail(path: string, what: string): never {
    throw new ProjectFormatError(`Invalid project: ${path} ${what}`);
}

function obj(value: unknown, path: string): Rec {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'must be an object');
    return value as Rec;
}

function str(value: unknown, path: string): string {
    if (typeof value !== 'string') fail(path, 'must be a string');
    return value;
}

function num(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number');
    return value;
}

function bool(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') fail(path, 'must be a boolean');
    return value;
}

function arr(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) fail(path, 'must be an array');
    return value;
}

function oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
        fail(path, `must be one of ${allowed.join(', ')}`);
    }
    return value as T;
}

function strings(value: unknown, path: string): string[] {
    return arr(value, path).map((item, i) => str(item, `${path}[${i}]`));
}

function parseProduct(value: unknown, path: string): ProductRecord {
    const p = obj(value, path);
    const attachment = obj(p.attachment, `${path}.attachment`);
    const params = obj(p.params, `${path}.params`);
    return {
        instanceId: str(p.instanceId, `${path}.instanceId`),
        productType: str(p.productType, `${path}.productType`),
        name: str(p.name, `${path}.name`),
        attachment: {
            wallFaceId: str(attachment.wallFaceId, `${path}.attachment.wallFaceId`),
            alongWallOffsetMm: num(attachment.alongWallOffsetMm, `${path}.attachment.alongWallOffsetMm`)
        },
        params: {
            widthMm: num(params.widthMm, `${path}.params.widthMm`),
            depthMm: num(params.depthMm, `${path}.params.depthMm`),
            wallHeightMm: num(params.wallHeightMm, `${path}.params.wallHeightMm`),
            undersideHeightMm: num(params.undersideHeightMm, `${path}.params.undersideHeightMm`),
            postInterval: num(params.postInterval, `${path}.params.postInterval`),
            rafterInterval: num(params.rafterInterval, `${path}.params.rafterInterval`)
        },
        lockedDimensions: strings(p.lockedDimensions, `${path}.lockedDimensions`),
        lockedParameters: strings(p.lockedParameters, `${path}.lockedParameters`)
    };
}

export function parseProject(value: unknown): ProjectDocument {
    const d = obj(value, 'project');
    if (d.schemaVersion !== 1) fail('schemaVersion', `must be 1, got ${JSON.stringify(d.schemaVersion)}`);
    const name = str(d.name, 'name');
    if (name.length < 1 || name.length > 120) fail('name', 'must be 1-120 characters');
    const revision = num(d.revision, 'revision');
    if (!Number.isInteger(revision) || revision < 0) fail('revision', 'must be a non-negative integer');
    const house = obj(d.house, 'house');
    const typologyId = str(house.typologyId, 'house.typologyId');
    if (!typologyId) fail('house.typologyId', 'must not be empty');
    const dims = obj(obj(d.site, 'site').dimensionsMm, 'site.dimensionsMm');
    const display = obj(d.display, 'display');
    const media = obj(d.media, 'media');
    return {
        schemaVersion: 1,
        id: str(d.id, 'id'),
        name,
        revision,
        createdAt: str(d.createdAt, 'createdAt'),
        updatedAt: str(d.updatedAt, 'updatedAt'),
        house: { source: oneOf(house.source, 'house.source', ['preset', 'photo'] as const), typologyId },
        site: {
            dimensionsMm: {
                front: num(dims.front, 'site.dimensionsMm.front'),
                back: num(dims.back, 'site.dimensionsMm.back'),
                left: num(dims.left, 'site.dimensionsMm.left'),
                right: num(dims.right, 'site.dimensionsMm.right')
            }
        },
        display: {
            representation: oneOf(display.representation, 'display.representation', ['white', 'color-block', 'render'] as const),
            trees: bool(display.trees, 'display.trees'),
            fence: bool(display.fence, 'display.fence'),
            dimensions: bool(display.dimensions, 'display.dimensions')
        },
        products: arr(d.products, 'products').map((p, i) => parseProduct(p, `products[${i}]`)),
        media: { renders: arr(media.renders, 'media.renders'), references: arr(media.references, 'media.references') }
    };
}
