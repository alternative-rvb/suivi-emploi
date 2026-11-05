import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: l'interface vit dans client/, le build va dans dist/ (servi par server.mjs)
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    // ANCHOR: en développement, les appels /api sont redirigés vers server.mjs
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
