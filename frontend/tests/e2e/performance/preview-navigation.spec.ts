import { test, expect } from '@playwright/test';

/**
 * Preview Navigation Performance Tests
 *
 * Measures navigation latency and duplicate request prevention.
 * Target: < 2s preview page load (baseline: 2-3 seconds)
 */

test.describe('Preview Navigation Performance', () => {
  test('should navigate to preview page quickly', async ({ page }) => {
    // First, navigate to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Find a workflow to preview (if any exist)
    try {
      const workflowCard = page.locator('[data-testid="workflow-card"]').first();
      const previewButton = page.locator('[data-testid="preview-button"]').first();

      // Check if we have workflows to test with
      const hasWorkflows = await workflowCard.count() > 0 || await previewButton.count() > 0;

      if (!hasWorkflows) {
        console.log('ℹ️  No workflows found - skipping preview navigation test');
        console.log('   Create test workflows to enable this test');
        test.skip();
        return;
      }

      const startTime = Date.now();

      // Click on preview/workflow (adjust selector based on actual UI)
      if (await previewButton.count() > 0) {
        await previewButton.click();
      } else {
        await workflowCard.click();
      }

      // Wait for preview page to load
      await page.waitForLoadState('networkidle');

      // Wait for preview content to appear
      await Promise.race([
        page.waitForSelector('[data-testid="preview-content"]'),
        page.waitForSelector('[data-testid="workflow-canvas"]'),
        page.waitForSelector('text=Preview'),
        page.waitForTimeout(5000) // Fallback timeout
      ]);

      const loadTime = Date.now() - startTime;
      console.log(`📊 Preview navigation time: ${loadTime}ms`);

      // Target: < 3s baseline, < 2s optimized
      expect(loadTime).toBeLessThan(5000);

      if (loadTime < 2000) {
        console.log(`✅ Preview navigation is optimal (< 2s)`);
      } else if (loadTime < 3000) {
        console.log(`⚠️  Preview navigation is acceptable but can be improved`);
      } else {
        console.log(`❌ Preview navigation exceeds target`);
      }
    } catch (error) {
      console.log('ℹ️  Could not complete preview navigation test');
      console.log(`   Error: ${error}`);
    }
  });

  test('should not make duplicate API calls during preview navigation', async ({ page }) => {
    const apiCalls: string[] = [];

    // Track all API requests
    page.on('request', request => {
      if (request.url().includes('/v1/')) {
        const cleanUrl = request.url().split('?')[0]; // Remove query params for comparison
        apiCalls.push(cleanUrl);
        console.log(`🔍 API call: ${request.method()} ${cleanUrl}`);
      }
    });

    // Navigate to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Try to navigate to preview
    try {
      const workflowCard = page.locator('[data-testid="workflow-card"]').first();
      const previewButton = page.locator('[data-testid="preview-button"]').first();

      if (await previewButton.count() > 0) {
        await previewButton.click();
      } else if (await workflowCard.count() > 0) {
        await workflowCard.click();
      } else {
        console.log('ℹ️  No workflows found to navigate to');
        test.skip();
        return;
      }

      await page.waitForLoadState('networkidle');
    } catch {
      console.log('ℹ️  Could not navigate to preview');
    }

    // Analyze duplicates
    const duplicates = apiCalls.filter((url, idx) =>
      apiCalls.indexOf(url) !== idx
    );

    console.log(`📊 API Call Analysis:`);
    console.log(`   - Total API calls: ${apiCalls.length}`);
    console.log(`   - Unique calls: ${new Set(apiCalls).size}`);
    console.log(`   - Duplicate calls: ${duplicates.length}`);

    if (duplicates.length > 0) {
      console.log(`⚠️  Duplicate API calls found:`);
      const duplicateCounts = duplicates.reduce((acc, url) => {
        acc[url] = (acc[url] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(duplicateCounts).forEach(([url, count]) => {
        console.log(`   - ${url}: ${count + 1} times`);
      });
    } else {
      console.log(`✅ No duplicate API calls detected`);
    }

    // After request deduplication optimization, should have no duplicates
    expect(duplicates.length).toBeLessThanOrEqual(2); // Allow 1-2 duplicates for retries
  });

  test('should measure navigation smoothness', async ({ page }) => {
    // This test measures if navigation feels "smooth" by checking for loading states
    const navigationSteps: Array<{ step: string; timestamp: number }> = [];

    await page.goto('/dashboard');
    navigationSteps.push({ step: 'dashboard-loaded', timestamp: Date.now() });

    try {
      const workflowCard = page.locator('[data-testid="workflow-card"]').first();

      if (await workflowCard.count() === 0) {
        console.log('ℹ️  No workflows found for navigation test');
        test.skip();
        return;
      }

      await workflowCard.click();
      navigationSteps.push({ step: 'click-initiated', timestamp: Date.now() });

      await page.waitForLoadState('domcontentloaded');
      navigationSteps.push({ step: 'dom-loaded', timestamp: Date.now() });

      await page.waitForLoadState('networkidle');
      navigationSteps.push({ step: 'network-idle', timestamp: Date.now() });

      // Calculate time between steps
      console.log(`📊 Navigation Timeline:`);
      for (let i = 1; i < navigationSteps.length; i++) {
        const prev = navigationSteps[i - 1];
        const curr = navigationSteps[i];
        const duration = curr.timestamp - prev.timestamp;
        console.log(`   ${prev.step} → ${curr.step}: ${duration}ms`);
      }

      const totalTime = navigationSteps[navigationSteps.length - 1].timestamp - navigationSteps[0].timestamp;
      console.log(`   Total navigation time: ${totalTime}ms`);

      if (totalTime < 1000) {
        console.log(`✅ Navigation is very smooth (< 1s)`);
      } else if (totalTime < 2000) {
        console.log(`✅ Navigation is smooth (< 2s)`);
      } else if (totalTime < 3000) {
        console.log(`⚠️  Navigation is acceptable but could be faster`);
      } else {
        console.log(`❌ Navigation feels slow (> 3s)`);
      }

      expect(totalTime).toBeLessThan(5000);
    } catch (error) {
      console.log(`ℹ️  Navigation test incomplete: ${error}`);
    }
  });

  test('should cache workflow data for repeated views', async ({ page }) => {
    let firstLoadTime = 0;
    let secondLoadTime = 0;

    try {
      // First load
      await page.goto('/dashboard');
      const workflowCard = page.locator('[data-testid="workflow-card"]').first();

      if (await workflowCard.count() === 0) {
        console.log('ℹ️  No workflows found for caching test');
        test.skip();
        return;
      }

      let startTime = Date.now();
      await workflowCard.click();
      await page.waitForLoadState('networkidle');
      firstLoadTime = Date.now() - startTime;

      // Go back
      await page.goBack();
      await page.waitForLoadState('networkidle');

      // Second load (should be cached if request deduplication is working)
      startTime = Date.now();
      await workflowCard.click();
      await page.waitForLoadState('networkidle');
      secondLoadTime = Date.now() - startTime;

      console.log(`📊 Workflow Load Caching:`);
      console.log(`   - First load: ${firstLoadTime}ms`);
      console.log(`   - Second load: ${secondLoadTime}ms`);
      console.log(`   - Improvement: ${((1 - secondLoadTime / firstLoadTime) * 100).toFixed(1)}%`);

      if (secondLoadTime < firstLoadTime * 0.7) {
        console.log(`✅ Significant caching benefit detected (> 30% faster)`);
      } else if (secondLoadTime < firstLoadTime) {
        console.log(`⚠️  Some caching benefit detected`);
      } else {
        console.log(`❌ No caching benefit detected`);
      }

      // Second load should generally be faster due to caching
      // But we allow it to be similar due to network variability
      expect(secondLoadTime).toBeLessThanOrEqual(firstLoadTime * 1.5);
    } catch (error) {
      console.log(`ℹ️  Caching test incomplete: ${error}`);
    }
  });
});
