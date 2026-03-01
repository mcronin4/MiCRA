# MiCRA Performance Testing Guide

This document explains how to run performance tests and capture baseline/optimized metrics.

## Setup Complete ✅

The following has been installed and configured:

- ✅ Playwright 1.58.2 with Chromium browser
- ✅ Performance test suite (13 tests across 4 files)
- ✅ Benchmark comparison script
- ✅ Test scripts in package.json
- ✅ Configuration in playwright.config.ts

## Test Files

### Performance Test Suites

1. **`tests/e2e/performance/dashboard-load.spec.ts`** (3 tests)
   - Dashboard load timing
   - API call timing for list_workflows
   - Duplicate request detection

2. **`tests/e2e/performance/api-latency.spec.ts`** (3 tests)
   - Average API call latency
   - Session caching effectiveness
   - API call parallelization

3. **`tests/e2e/performance/file-operations.spec.ts`** (3 tests)
   - File list load timing
   - File API performance
   - URL generation parallelization

4. **`tests/e2e/performance/preview-navigation.spec.ts`** (4 tests)
   - Preview page navigation timing
   - Duplicate API call detection
   - Navigation smoothness
   - Workflow data caching

**Total: 13 performance tests**

## Running Performance Tests

### Prerequisites

Before running performance tests, ensure both servers are running:

```bash
# Terminal 1: Start backend server
cd backend
uv run fastapi dev app/main.py

# Terminal 2: Start frontend server
cd frontend
pnpm dev
```

### Available Test Commands

```bash
# Run all performance tests (with console output)
pnpm test:perf

# Run tests in UI mode (interactive debugging)
pnpm test:e2e:ui

# View last test report
pnpm test:perf:report
```

### Capturing Baseline Metrics

**IMPORTANT: Run this BEFORE making any optimizations**

```bash
# 1. Ensure both servers are running (see Prerequisites above)

# 2. Capture baseline performance
cd frontend
pnpm test:perf:baseline

# This will:
# - Run all 13 performance tests
# - Generate test-results/results.json
# - Copy results to benchmark-results/baseline.json
```

### Capturing Optimized Metrics

**Run this AFTER implementing optimizations**

```bash
# With both servers still running
cd frontend
pnpm test:perf:optimized

# This will:
# - Run all 13 performance tests again
# - Generate test-results/results.json
# - Copy results to benchmark-results/optimized.json
```

### Generating Comparison Report

```bash
# After capturing both baseline and optimized metrics
cd frontend
pnpm benchmark:compare

# This will:
# - Compare baseline.json vs optimized.json
# - Generate benchmark-results/report.md (markdown)
# - Generate benchmark-results/report.html (visual report)
# - Display summary in console
```

## Expected Performance Targets

### Baseline (Before Optimization)
- Dashboard load: 3-5 seconds
- API latency (avg): 300-500ms
- File list (50 files): 2-3 seconds
- Preview navigation: 2-3 seconds

### Optimized (After Phase 1)
- Dashboard load: **< 2 seconds** (60-70% faster)
- API latency (avg): **< 200ms** (60% faster)
- File list (50 files): **< 1.5 seconds** (50% faster)
- Preview navigation: **< 2 seconds** (30% faster)
- **Zero duplicate API calls** during navigation

## Troubleshooting

### Tests are failing with "page.goto: net::ERR_CONNECTION_REFUSED"

**Cause**: Frontend dev server is not running

**Solution**: Start the frontend server in a separate terminal:
```bash
cd frontend
pnpm dev
```

### Tests timeout waiting for selectors

**Cause**: Either:
1. Backend server is not running (API calls fail)
2. No test data exists in the database (empty workflows/files)

**Solution**:
1. Start backend server:
   ```bash
   cd backend
   uv run fastapi dev app/main.py
   ```

2. Create test data by:
   - Creating at least 2-3 workflows in the UI
   - Uploading some files to test file operations
   - The tests will gracefully skip if data is missing

### Baseline and optimized results look identical

**Cause**: You ran both captures before implementing the optimizations

**Solution**:
1. Run `pnpm test:perf:baseline` FIRST
2. Implement the 4 optimizations (1.1-1.4)
3. THEN run `pnpm test:perf:optimized`

## Test Output Example

When running `pnpm test:perf`, you'll see output like:

```
📊 Dashboard load time: 3247ms
⚠️  Dashboard load time exceeds optimized target (2s)

📊 list_workflows API duration: 4183.25ms
   - Time to first byte: 3845.73ms

📊 API Performance Metrics:
   - Total API calls: 5
   - Average duration: 342.18ms
   - Min duration: 124.35ms
   - Max duration: 4183.25ms
```

After optimization, the same tests should show:

```
📊 Dashboard load time: 987ms
✅ Dashboard load time is optimal (< 2s)

📊 list_workflows API duration: 856.42ms
   - Time to first byte: 412.18ms

📊 API Performance Metrics:
   - Total API calls: 5
   - Average duration: 124.33ms
   - Min duration: 87.12ms
   - Max duration: 856.42ms
   ✅ Average API latency is optimal (< 200ms)
```

## Next Steps

1. **Capture baseline**: `pnpm test:perf:baseline`
2. **Implement optimizations**: See main implementation plan
3. **Capture optimized**: `pnpm test:perf:optimized`
4. **Generate report**: `pnpm benchmark:compare`
5. **Verify targets met**: Check report.html

## Notes

- Tests run sequentially (not in parallel) for consistent performance measurements
- Each test suite logs detailed metrics to console
- Tests are designed to be resilient - they gracefully skip if data is missing
- Use `--ui` mode for debugging individual tests interactively
- Results are saved in JSON format for programmatic analysis
