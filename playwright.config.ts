import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  // Temporary test CA only. No system trust installation; backend tests verify the actual CA chain.
  use: { baseURL: 'https://127.0.0.1:3107', ignoreHTTPSErrors: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build:web && npx tsx tests/server.ts',
    url: 'https://127.0.0.1:3107',
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
