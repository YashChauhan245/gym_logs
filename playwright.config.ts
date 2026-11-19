import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 2,
  use: { baseURL: 'http://localhost:3210', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: { command: 'npm run start -- --hostname localhost --port 3210', url: 'http://localhost:3210', reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
