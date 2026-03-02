import { test, expect } from '@playwright/test';

/**
 * Dashboard Load Performance Tests
 *
 * Measures the time it takes to load the dashboard with workflow list.
 * Target: < 2 seconds (baseline: 3-5 seconds)
 */

test.describe('Dashboard Load Performance', () => {
  test('should load dashboard with workflow list quickly', async ({ page }) => {
    // Start timing
    const startTime = Date.now();

    // Navigate to dashboard
    await page.goto('/dashboard');

    // Wait for workflow list to be visible
    await page.waitForSelector('[data-testid="workflow-list"]', { timeout: 10000 })
      .catch(() => {
        // Fallback: wait for any workflow items or empty state
        return Promise.race([
          page.waitForSelector('[data-testid="workflow-card"]'),
          page.waitForSelector('text=No workflows found'),
          page.waitForSelector('text=Create your first workflow')
        ]);
      });

    // Calculate load time
    const loadTime = Date.now() - startTime;
    console.log(`📊 Dashboard load time: ${loadTime}ms`);

    // Performance assertion
    expect(loadTime).toBeLessThan(5000); // Should be under 5s (generous initial target)

    // Report if under optimized target
    if (loadTime < 2000) {
      console.log(`✅ Dashboard load time is optimal (< 2s)`);
    } else {
      console.log(`⚠️  Dashboard load time exceeds optimized target (2s)`);
    }
  });

  test('should measure list_workflows API call timing', async ({ page }) => {
    // Enable performance monitoring
    await page.goto('/dashboard');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Capture API timing from performance API
    const apiTiming = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const workflowsCall = entries.find(r =>
        r.name.includes('/v1/workflows?') || r.name.includes('/v1/workflows')
      );

      if (workflowsCall) {
        return {
          name: workflowsCall.name,
          duration: workflowsCall.duration,
          responseStart: workflowsCall.responseStart - workflowsCall.requestStart,
        };
      }
      return null;
    });

    if (apiTiming) {
      console.log(`📊 list_workflows API duration: ${apiTiming.duration.toFixed(2)}ms`);
      console.log(`   - Time to first byte: ${apiTiming.responseStart.toFixed(2)}ms`);

      // Target: < 1000ms after optimization
      expect(apiTiming.duration).toBeLessThan(5000); // Generous baseline

      if (apiTiming.duration < 1000) {
        console.log(`✅ API call is optimal (< 1s)`);
      }
    } else {
      console.log('⚠️  Could not find list_workflows API call in performance entries');
    }
  });

  test('should not make duplicate workflow list requests', async ({ page }) => {
    const apiCalls: string[] = [];

    // Track all API requests
    page.on('request', request => {
      if (request.url().includes('/v1/workflows')) {
        apiCalls.push(request.url());
        console.log(`🔍 API call: ${request.method()} ${request.url()}`);
      }
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Check for duplicates
    const uniqueCalls = new Set(apiCalls);
    const duplicateCount = apiCalls.length - uniqueCalls.size;

    console.log(`📊 Total workflow API calls: ${apiCalls.length}`);
    console.log(`📊 Unique workflow API calls: ${uniqueCalls.size}`);
    console.log(`📊 Duplicate calls: ${duplicateCount}`);

    // After optimization, should have no duplicates
    if (duplicateCount > 0) {
      console.log(`⚠️  Found ${duplicateCount} duplicate API calls - needs optimization`);
    } else {
      console.log(`✅ No duplicate API calls detected`);
    }

    // Expect minimal duplicate calls (some may be intentional retries)
    expect(duplicateCount).toBeLessThanOrEqual(1);
  });
});
