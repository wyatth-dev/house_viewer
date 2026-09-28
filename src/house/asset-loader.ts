import type { Asset, AssetRegistry } from 'playcanvas';
/** Reject promptly on disposal, even if the engine clears its pending callbacks. */
export function loadContainer(
    registry: Pick<AssetRegistry, 'loadFromUrl'>,
    url: string,
    signal: AbortSignal
): Promise<Asset> {
    return new Promise((resolve, reject) => {
        const cancel = () => reject(new DOMException('Scene loading cancelled', 'AbortError'));
        if (signal.aborted) {
            cancel();
            return;
        }
        signal.addEventListener('abort', cancel, { once: true });
        registry.loadFromUrl(url, 'container', (error, asset) => {
            signal.removeEventListener('abort', cancel);
            if (signal.aborted) return; // App destruction owns any engine assets after cancellation.
            if (error || !asset)
                reject(new Error('The house model could not be loaded. Check public/models/house.glb.'));
            else resolve(asset);
        });
    });
}
