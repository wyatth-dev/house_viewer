/** All scene coordinates, geometric bounds and engineering dimensions use millimetres. */
export const MM_PER_METRE = 1000;
export const metresToMm = (value: number): number => value * MM_PER_METRE;
export const mmToMetres = (value: number): number => value / MM_PER_METRE;
