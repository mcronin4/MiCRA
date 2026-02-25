# E2E Tests for MiCRA

This directory contains end-to-end tests using Playwright to verify the application's behavior in a real browser environment.

## Setup

### 1. Install Dependencies

Playwright is already installed as a dev dependency. If you need to reinstall browsers:

```bash
pnpm exec playwright install chromium
```

### 2. Set Up Test Credentials

The workflow loading tests require valid credentials to test authenticated workflows. Set these environment variables:

```bash
export TEST_EMAIL="your-test-email@example.com"
export TEST_PASSWORD="your-test-password"
```

Or create a `.env.test.local` file in the frontend directory:

```
TEST_EMAIL=your-test-email@example.com
TEST_PASSWORD=your-test-password
```

**Important**: Never commit real credentials to the repository!

## Running Tests

### Run all E2E tests
```bash
pnpm test:e2e
```

### Run tests with UI mode (recommended for development)
```bash
pnpm test:e2e:ui
```

This opens an interactive UI where you can:
- Watch tests run in real-time
- Step through tests
- See detailed traces and screenshots
- Debug failures easily

### Run tests in debug mode
```bash
pnpm test:e2e:debug
```

This runs tests with the Playwright Inspector for step-by-step debugging.

### Run specific test file
```bash
pnpm exec playwright test workflow-loading
```

### Run tests in headed mode (see the browser)
```bash
pnpm exec playwright test --headed
```

## Current Tests

### `workflow-loading.spec.ts`

Tests the workflow loading UX improvements to verify:

1. **No Flash of Old Workflow**: When switching between workflows, the old workflow data doesn't briefly appear before the new one loads
2. **Loading Overlay**: A loading indicator appears during workflow load
3. **Immediate Feedback**: Toast notification shows immediately when clicking a workflow

**Requirements**:
- At least 2 workflows in the test account
- Both frontend and backend services running

## Test Structure

```
e2e/
├── README.md                    # This file
└── workflow-loading.spec.ts     # Workflow loading UX tests
```

## CI/CD Integration

To run tests in CI, ensure:

1. `TEST_EMAIL` and `TEST_PASSWORD` are set as secrets
2. Backend and database services are available
3. Run with: `pnpm test:e2e`

Tests will automatically:
- Retry failed tests 2 times on CI
- Generate HTML report in `playwright-report/`
- Create traces for failed tests

## Viewing Test Reports

After running tests, view the HTML report:

```bash
pnpm exec playwright show-report
```

## Writing New Tests

Follow this pattern:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup (login, navigate, etc.)
  });

  test('should do something', async ({ page }) => {
    // Test implementation
  });
});
```

## Troubleshooting

### Tests skip with "TEST_EMAIL and TEST_PASSWORD required"
- Set the environment variables as described in Setup section

### Tests timeout during login
- Verify backend is running on http://localhost:8000
- Verify frontend is running on http://localhost:3000
- Check test credentials are valid

### "No workflows found" errors
- Create at least 2 workflows in the test account
- Ensure database is seeded with test data

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Tests](https://playwright.dev/docs/debug)
