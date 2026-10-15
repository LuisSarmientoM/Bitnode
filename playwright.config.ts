import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3107', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build:web && npx tsx tests/server.ts',
    url: 'http://127.0.0.1:3107',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
