import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const baseURL = process.env.PLAYWRIGHT_MOBILE_BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  outputDir: '../test-results/mobile',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL, trace: 'retain-on-failure', viewport: { width: 390, height: 844 } },
  webServer: {
    command: 'npm run mobile:preview',
    cwd: resolve(__dirname, '..'),
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        channel:
          process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
      },
    },
  ],
});
