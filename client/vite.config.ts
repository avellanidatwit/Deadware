import { contentSecurityPolicy } from './config/contentSecurityPolicy.mjs';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { clientDeployment } from './config/deployment.mjs';
const clientRoot = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ mode, command }) => {
  const { base, apiUrl } = clientDeployment(
    loadEnv(mode, clientRoot, 'VITE_'),
    process.env.GITHUB_PAGES === 'true',
  );
  return {
    base,
    plugins: [
      {
        name: 'production-csp',
        transformIndexHtml() {
          return command === 'build'
            ? [
                {
                  tag: 'meta',
                  attrs: {
                    'http-equiv': 'Content-Security-Policy',
                    content: contentSecurityPolicy(apiUrl),
                  },
                  injectTo: 'head',
                },
              ]
            : [];
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': 'http://127.0.0.1:3000' },
    },
    preview: { host: '127.0.0.1' },
    build: { outDir: '../web-dist', emptyOutDir: true },
  };
});
