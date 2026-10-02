/** Scene positions and bounds are in millimeters; viewport/projection values are pixels. */
export type Point3 = { x: number; y: number; z: number };
export type Bounds3 = { min: Point3; max: Point3 };
export type Viewport = { width: number; height: number };
export type Projection = { x: number; y: number; visible: boolean };
export type ProjectPoint = (point: Point3) => Projection;
