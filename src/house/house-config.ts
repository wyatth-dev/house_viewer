/** Source coordinates verified against the named walls in the supplied GLB.
 * Front is +Z. The rear extension is included in the outer wall envelope.
 * Width confirmed by the user: 43 m (2026-09-28). Raw coordinates are millimeters.
 */
export const houseConfig = {
    url: '/models/house-edit.glb',
    actualWidthMeters: 43,
    sourceFootprint: { minX: -43000, maxX: 0, minZ: -57000, maxZ: 0 },
    groundY: 0,
    yawDegrees: 0
};
