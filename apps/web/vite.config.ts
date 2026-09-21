import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The browser only ever talks to its own origin (/api/...). Vite forwards
    // it to the API. In production a Vercel rewrite does the same job, which
    // keeps session cookies first-party (see docs/ARCHITECTURE.md, risk R3).
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: false },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
