import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const customizationEntry = '/src/customization/index.html';

/** Preserve the bookmarked lab URL without duplicating its HTML at the root. */
function legacyLabRoute() {
    const rewrite = (server) => {
        server.middlewares.use((request, _response, next) => {
            if (request.url?.split('?')[0] === '/varenda-lab.html') {
                request.url = customizationEntry + request.url.slice('/varenda-lab.html'.length);
            }
            next();
        });
    };
    return {
        name: 'legacy-varenda-lab-route',
        configureServer: rewrite,
        configurePreviewServer: rewrite
    };
}

export default defineConfig({
    appType: 'mpa',
    plugins: [legacyLabRoute()],
    build: {
        rollupOptions: {
            input: {
                main: fileURLToPath(new URL('./index.html', import.meta.url)),
                customization: fileURLToPath(new URL(`.${customizationEntry}`, import.meta.url))
            }
        }
    }
});
