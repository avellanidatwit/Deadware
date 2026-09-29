import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_').VITE_BASE_PATH || './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3000' } },
  preview: { host: '127.0.0.1' },
  build: { outDir: '../web-dist', emptyOutDir: true },
}));
