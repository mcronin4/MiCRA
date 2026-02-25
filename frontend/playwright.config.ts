import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for MiCRA performance testing
 * Focuses on measuring real-world latency improvements
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,  // Run perf tests sequentially for consistent results
  forbidOnly: !!process.env.CI,
  retries: 0,  // No retries for performance tests (we want accurate timings)
  workers: 1,  // Single worker for consistent performance measurements

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']  // Console output
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,  // 2 minutes for server startup
  },
});
