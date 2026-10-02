import type { AppBase, Asset, AssetRegistry, ContainerResource } from 'playcanvas';

/** Generic container loading shared by House and product views. */
export function loadContainer(
    registry: Pick<AssetRegistry, 'loadFromUrl'>,
    url: string,
    signal: AbortSignal
): Promise<Asset> {
    return new Promise((resolve, reject) => {
        const cancel = () => reject(new DOMException('Scene loading canceled', 'AbortError'));
        if (signal.aborted) return cancel();
        signal.addEventListener('abort', cancel, { once: true });
        registry.loadFromUrl(url, 'container', (error, asset) => {
            signal.removeEventListener('abort', cancel);
            if (signal.aborted) return;
            if (error || !asset) reject(new Error(`Asset could not be loaded: ${url}`, { cause: error }));
            else resolve(asset);
        });
    });
}

export type ProductAssetStore = ReturnType<typeof createProductAssetStore>;

/** Scene owns this store; views own entities, never the shared assets. */
export function createProductAssetStore(app: Pick<AppBase, 'assets'>, signal: AbortSignal) {
    const pending = new Map<string, Promise<ContainerResource>>();
    const loaded = new Set<Asset>();
    let destroyed = false;
    const release = (asset: Asset) => {
        asset.unload();
        app.assets.remove(asset);
    };
    return {
        load(url: string): Promise<ContainerResource> {
            if (destroyed || signal.aborted) {
                return Promise.reject(new DOMException('Asset store disposed', 'AbortError'));
            }
            const existing = pending.get(url);
            if (existing) return existing;
            const result = loadContainer(app.assets, url, signal).then((asset) => {
                if (destroyed) {
                    release(asset);
                    throw new DOMException('Asset store disposed', 'AbortError');
                }
                loaded.add(asset);
                return asset.resource as ContainerResource;
            });
            pending.set(url, result);
            return result;
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            for (const asset of loaded) release(asset);
            loaded.clear();
            pending.clear();
        }
    };
}
