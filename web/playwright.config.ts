import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:1999',
    trace: 'on-first-retry',
    // Ubuntu 26.04 is not yet supported by Playwright's bundled Chromium;
    // use the system-installed Chrome instead.
    executablePath: '/usr/bin/google-chrome',
    // Auth state saved via: playwright-cli state-save playwright/.auth/user.json
    storageState: 'playwright/.auth/user.json',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:1999',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
