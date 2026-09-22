import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The E2E tests point this at their own API instance; normally it's the dev API.
const API_URL = process.env.DOCDRIFT_API_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The browser only ever talks to its own origin (/api/...). Vite forwards
    // it to the API. In production a Vercel rewrite does the same job, which
    // keeps session cookies first-party (see docs/ARCHITECTURE.md, risk R3).
    proxy: {
      '/api': { target: API_URL, changeOrigin: false },
    },
  },
  // `vite preview` (used by the E2E tests) proxies the same way.
  preview: {
    proxy: {
      '/api': { target: API_URL, changeOrigin: false },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
