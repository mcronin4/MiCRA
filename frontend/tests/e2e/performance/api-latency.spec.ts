import { test, expect } from '@playwright/test';

/**
 * API Latency Performance Tests
 *
 * Measures API call overhead and session caching effectiveness.
 * Target: < 200ms average API latency (baseline: 300-500ms)
 */

test.describe('API Latency Performance', () => {
  test('should have low average API call latency', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Capture all API call timings
    const apiTimings = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const apiCalls = entries
        .filter(r => r.name.includes('/v1/'))
        .map(r => ({
          name: r.name.split('/v1/')[1]?.split('?')[0] || 'unknown',
          duration: r.duration,
          url: r.name
        }));

      return apiCalls;
    });

    if (apiTimings.length > 0) {
      const avgDuration = apiTimings.reduce((sum, t) => sum + t.duration, 0) / apiTimings.length;
      const maxDuration = Math.max(...apiTimings.map(t => t.duration));
      const minDuration = Math.min(...apiTimings.map(t => t.duration));

      console.log(`📊 API Performance Metrics:`);
      console.log(`   - Total API calls: ${apiTimings.length}`);
      console.log(`   - Average duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`   - Min duration: ${minDuration.toFixed(2)}ms`);
      console.log(`   - Max duration: ${maxDuration.toFixed(2)}ms`);

      // Log individual calls
      apiTimings.forEach(t => {
        console.log(`   - ${t.name}: ${t.duration.toFixed(2)}ms`);
      });

      // Target: < 500ms average before optimization, < 200ms after
      expect(avgDuration).toBeLessThan(1000); // Generous baseline

      if (avgDuration < 200) {
        console.log(`✅ Average API latency is optimal (< 200ms)`);
      } else if (avgDuration < 500) {
        console.log(`⚠️  Average API latency is acceptable but can be improved`);
      } else {
        console.log(`❌ Average API latency exceeds target (500ms+)`);
      }
    } else {
      console.log('⚠️  No API calls detected');
    }
  });

  test('should measure session caching effectiveness', async ({ page }) => {
    let getSessionCalls = 0;

    // Intercept Supabase auth calls (if accessible via network monitoring)
    page.on('request', request => {
      const url = request.url();
      if (url.includes('supabase') && url.includes('auth')) {
        getSessionCalls++;
        console.log(`🔐 Supabase auth call detected: ${url}`);
      }
    });

    // Make multiple navigation actions that trigger API calls
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Navigate to another page (if exists)
    const workflowLink = page.locator('[data-testid="workflow-card"]').first();
    if (await workflowLink.count() > 0) {
      await workflowLink.click();
      await page.waitForLoadState('networkidle');
      await page.goBack();
      await page.waitForLoadState('networkidle');
    }

    console.log(`📊 Supabase auth calls detected: ${getSessionCalls}`);

    // After session caching, should see very few auth calls
    // (Note: This is a rough proxy - actual measurement happens in unit tests)
    if (getSessionCalls < 5) {
      console.log(`✅ Session caching appears to be working (< 5 auth calls)`);
    } else {
      console.log(`⚠️  High number of auth calls detected - session caching may need improvement`);
    }
  });

  test('should measure API call parallelization', async ({ page }) => {
    const apiCallTimestamps: Array<{ url: string; timestamp: number }> = [];

    page.on('request', request => {
      if (request.url().includes('/v1/')) {
        apiCallTimestamps.push({
          url: request.url(),
          timestamp: Date.now()
        });
      }
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    if (apiCallTimestamps.length > 1) {
      // Calculate time spread of API calls
      const timestamps = apiCallTimestamps.map(c => c.timestamp);
      const firstCall = Math.min(...timestamps);
      const lastCall = Math.max(...timestamps);
      const timeSpread = lastCall - firstCall;

      console.log(`📊 API Call Parallelization:`);
      console.log(`   - Total API calls: ${apiCallTimestamps.length}`);
      console.log(`   - Time spread: ${timeSpread}ms`);
      console.log(`   - Average interval: ${(timeSpread / (apiCallTimestamps.length - 1)).toFixed(2)}ms`);

      // If calls are well parallelized, time spread should be small relative to count
      const avgInterval = timeSpread / (apiCallTimestamps.length - 1);

      if (avgInterval < 50) {
        console.log(`✅ API calls are well parallelized (< 50ms average interval)`);
      } else if (avgInterval < 200) {
        console.log(`⚠️  API calls have moderate parallelization`);
      } else {
        console.log(`❌ API calls appear to be sequential (> 200ms average interval)`);
      }
    }
  });
});
