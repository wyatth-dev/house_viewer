import type { Footprint } from '../scene/house/types.ts';
import type { Bounds3, ProjectPoint } from '../shared/geometry/types.ts';
export type SiteSide = 'front' | 'back' | 'left' | 'right';
/** Yard clearances in millimeters. UI may display meters. */
export type Dimensions = Record<SiteSide, number>;
export type SiteState = { dimensions: Dimensions };
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
export type Layout = { property: Rect; regions: Record<SiteSide, Rect>; width: number; depth: number };
export type DimensionErrors = Partial<Record<SiteSide, string>>;
export type SiteController = {
    setDimensions(value: Dimensions): DimensionErrors;
    getState(): SiteState;
    getLayout(): Layout;
    getBounds(): Bounds3;
    refreshLabels(project: ProjectPoint): void;
    setVisible(visible: boolean): void;
    setMeasurementsVisible(visible: boolean): void;
    setDimensionEditor(editor: (side: SiteSide, valueMm: number) => string | undefined): void;
    /** Replace the house envelope (typology switch); yard dimensions are kept. */
    setFootprint(footprint: Footprint): void;
    destroy(): void;
};
