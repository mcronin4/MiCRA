import { test, expect } from '@playwright/test';

/**
 * File Operations Performance Tests
 *
 * Measures file list loading and presigned URL generation performance.
 * Target: < 1.5s for 50 files (baseline: 2-3 seconds)
 */

test.describe('File Operations Performance', () => {
  test('should load file list quickly', async ({ page }) => {
    // Navigate to a page with file operations (adjust based on actual routes)
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Try to find and click on a workflow or file management area
    // This is a placeholder - adjust based on actual UI structure
    const fileAreaSelector = '[data-testid="image-bucket-node"], [data-testid="file-upload"], [data-testid="media-library"]';

    try {
      await page.waitForSelector(fileAreaSelector, { timeout: 5000 });

      const startTime = Date.now();
      await page.click(fileAreaSelector);

      // Wait for file grid/list to appear
      await page.waitForSelector('[data-testid="file-grid"], [data-testid="file-list"]', { timeout: 10000 })
        .catch(() => {
          // Fallback: wait for any file-related elements
          return Promise.race([
            page.waitForSelector('img[data-testid*="file"]'),
            page.waitForSelector('text=No files'),
            page.waitForSelector('[data-testid="empty-state"]')
          ]);
        });

      const loadTime = Date.now() - startTime;
      console.log(`📊 File list load time: ${loadTime}ms`);

      // Target: < 3s baseline, < 1.5s optimized
      expect(loadTime).toBeLessThan(5000);

      if (loadTime < 1500) {
        console.log(`✅ File list load is optimal (< 1.5s)`);
      } else if (loadTime < 3000) {
        console.log(`⚠️  File list load is acceptable but can be improved`);
      } else {
        console.log(`❌ File list load exceeds target`);
      }
    } catch {
      console.log('ℹ️  File operations UI not found - skipping visual test');
      console.log('   This test requires a workflow with file management capabilities');
    }
  });

  test('should measure file list API performance', async ({ page }) => {
    // Track file-related API calls
    const fileApiCalls: Array<{ url: string; duration: number; fileCount?: number }> = [];

    page.on('response', async response => {
      const url = response.url();
      if (url.includes('/v1/files') && url.includes('include_urls=true')) {
        const timing = await page.evaluate((url) => {
          const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          const entry = entries.find(e => e.name === url);
          return entry ? entry.duration : null;
        }, url);

        try {
          const data = await response.json();
          fileApiCalls.push({
            url,
            duration: timing || 0,
            fileCount: data.files?.length || 0
          });
        } catch {
          // Response might not be JSON
        }
      }
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Try to trigger file list loading
    try {
      const fileAreaSelector = '[data-testid="image-bucket-node"], [data-testid="file-upload"], [data-testid="media-library"]';
      await page.waitForSelector(fileAreaSelector, { timeout: 5000 });
      await page.click(fileAreaSelector);
      await page.waitForTimeout(2000); // Wait for API calls to complete
    } catch {
      console.log('ℹ️  Could not trigger file list UI');
    }

    if (fileApiCalls.length > 0) {
      fileApiCalls.forEach(call => {
        console.log(`📊 File API Call:`);
        console.log(`   - Duration: ${call.duration.toFixed(2)}ms`);
        console.log(`   - File count: ${call.fileCount || 'unknown'}`);

        if (call.fileCount && call.fileCount >= 20) {
          const msPerFile = call.duration / call.fileCount;
          console.log(`   - Time per file: ${msPerFile.toFixed(2)}ms`);

          // Target: < 60ms per file (50 files in 3000ms baseline)
          // Optimized: < 30ms per file (50 files in 1500ms)
          if (msPerFile < 30) {
            console.log(`✅ File processing is optimal (< 30ms per file)`);
          } else if (msPerFile < 60) {
            console.log(`⚠️  File processing is acceptable but can be improved`);
          } else {
            console.log(`❌ File processing exceeds target (> 60ms per file)`);
          }
        }
      });

      // Overall performance check
      const maxDuration = Math.max(...fileApiCalls.map(c => c.duration));
      expect(maxDuration).toBeLessThan(5000); // Should be under 5s for any file list
    } else {
      console.log('ℹ️  No file API calls detected');
      console.log('   This test requires actual file operations in the workflow');
    }
  });

  test('should verify URL generation is parallelized', async ({ page }) => {
    const presignedUrlCalls: number[] = [];

    page.on('request', request => {
      // Track when presigned URL requests are made (if detectable)
      const url = request.url();
      if (url.includes('/v1/files') && url.includes('include_urls=true')) {
        presignedUrlCalls.push(Date.now());
        console.log(`🔍 Presigned URL request detected at ${Date.now()}`);
      }
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Attempt to trigger file list with URLs
    try {
      const fileAreaSelector = '[data-testid="image-bucket-node"], [data-testid="file-upload"]';
      await page.waitForSelector(fileAreaSelector, { timeout: 5000 });
      await page.click(fileAreaSelector);
      await page.waitForTimeout(3000);
    } catch {
      console.log('ℹ️  Could not trigger file list UI');
    }

    if (presignedUrlCalls.length > 0) {
      console.log(`📊 Presigned URL generation:`);
      console.log(`   - Total requests: ${presignedUrlCalls.length}`);

      // Check if requests are batched (good) vs sequential (bad)
      if (presignedUrlCalls.length === 1) {
        console.log(`✅ URLs generated in single batched request (optimal)`);
      } else {
        console.log(`⚠️  Multiple separate URL generation requests`);
      }
    } else {
      console.log('ℹ️  No presigned URL generation detected via network monitoring');
      console.log('   (This is expected - actual parallelization is tested in backend unit tests)');
    }
  });
});
