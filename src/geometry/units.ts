/** All scene coordinates, geometric bounds and engineering dimensions use millimeters. */
export const MM_PER_METER = 1000;
export const metersToMm = (value: number): number => value * MM_PER_METER;
export const mmToMeters = (value: number): number => value / MM_PER_METER;
