import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for MiCRA E2E and performance testing
 *
 * Supports:
 * - Functional E2E tests in ./e2e/ (parallel execution)
 * - Performance tests in ./tests/e2e/performance/ (sequential execution)
 *
 * Use test:e2e for functional tests, test:perf for performance tests
 */
export default defineConfig({
  // Test directory matches both e2e/ and tests/e2e/
  testDir: './',
  testMatch: ['**/e2e/**/*.spec.ts', '**/tests/e2e/**/*.spec.ts'],

  /* Run tests in parallel by default (override with --workers=1 for perf tests) */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only (not for performance tests) */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI for consistent performance */
  workers: process.env.CI ? 1 : undefined,

  /* Multiple reporters for different use cases */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']  // Console output
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Capture screenshots and videos on failure */
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,  // 2 minutes for server startup
  },
});
