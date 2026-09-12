import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Monaco is bundled rather than pulled from a CDN (see lib/monacoSetup.ts),
  // which puts the editor and its language workers well past the default
  // warning size. That is the intended trade for an app that must work
  // offline on localhost.
  build: { chunkSizeWarningLimit: 5_000 },
  server: {
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
      '/api': { target: 'http://127.0.0.1:3001' },
    },
  },
});
