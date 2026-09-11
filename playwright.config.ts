import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 120000 },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL },
    },
  ],
});
