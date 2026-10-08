import { defineConfig } from 'vite';

/**
 * One page (index.html) for the house viewer, including photo intake.
 * During `npm run dev`, API and data requests go to the Python service (services/facade-modeler).
 * Unknown pages return 404.
 */
const service = `http://127.0.0.1:${process.env.FACADE_HTTP_PORT ?? '8765'}`;
export default defineConfig({
    appType: 'mpa',
    server: { proxy: { '/api': service, '/files': service, '/data': service } }
});
