import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * Two pages: index.html (house viewer) and intake.html (new typology from photo).
 * During `npm run dev`, API and data requests go to the Python service (services/facade-modeler).
 * Unknown pages return 404.
 */
const service = `http://127.0.0.1:${process.env.FACADE_HTTP_PORT ?? '8765'}`;
export default defineConfig({
    appType: 'mpa',
    server: { proxy: { '/api': service, '/files': service, '/data': service } },
    build: {
        rollupOptions: {
            input: {
                main: fileURLToPath(new URL('index.html', import.meta.url)),
                intake: fileURLToPath(new URL('intake.html', import.meta.url))
            }
        }
    }
});
