export function layoutPosts(
    widthMm: number,
    postIntervalMm: number
): number[] {
    if (
        !Number.isFinite(widthMm) ||
        !Number.isFinite(postIntervalMm) ||
        widthMm <= 0 ||
        postIntervalMm <= 0 ||
        postIntervalMm > widthMm
    ) {
        throw new Error('宽度与柱间距必须为正数，且柱间距不能大于宽度');
    }

    const remainder = widthMm % postIntervalMm;
    const gapCount = Math.round(
        (widthMm - remainder) / postIntervalMm
    );
    const start = remainder / 2;

    return Array.from(
        { length: gapCount + 1 },
        (_, index) => start + index * postIntervalMm
    );
}