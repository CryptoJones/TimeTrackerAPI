// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: proxy /v1 to the API so the SPA and API share an origin in
// development (no CORS). In production the built static files are served
// from the same origin as the API, so /v1 is a same-origin relative path.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/v1': { target: process.env.VITE_API_URL || 'http://localhost:3000', changeOrigin: true },
            '/healthz': { target: process.env.VITE_API_URL || 'http://localhost:3000', changeOrigin: true },
        },
    },
    build: { outDir: 'dist', sourcemap: false },
});
