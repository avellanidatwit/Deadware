import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js client',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
