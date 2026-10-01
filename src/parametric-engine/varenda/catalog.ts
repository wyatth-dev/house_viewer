export type CatalogProduct = {
    catalogProductId: string;
    productName: string | null;
    kind: 'profile' | 'plate' | 'fastener' | 'assembly';
    status: 'confirmed' | 'pending';
};

/** 内部目录键，不是厂家 SKU；不包含安装位置或用途。 */
export const varendaCatalog = {
    postProfile: {
        catalogProductId: 'varenda-post-profile',
        productName: null,
        kind: 'profile',
        status: 'pending'
    },

    footplate: {
        catalogProductId: 'varenda-footplate',
        productName: null,
        kind: 'assembly',
        status: 'pending'
    },

    screwM6x16Din7500cA2: {
        catalogProductId: 'fastener-m6-16-din7500c-a2-v1',
        productName: 'M6 x 16mm Pozi Pan Head Thread Forming Screws (DIN 7500C) - Stainless Steel (A2) v1',
        kind: 'fastener',
        status: 'confirmed'
    }
} as const satisfies Record<string, CatalogProduct>;
