#!/usr/bin/env ts-node

/**
 * Benchmark Comparison Script
 *
 * Compares baseline vs optimized performance test results and generates a report
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  name: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
  metrics?: Record<string, number>;
}

interface BenchmarkData {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestResult[];
}

function loadBenchmarkResults(filename: string): BenchmarkData | null {
  const filePath = path.join(__dirname, '..', 'benchmark-results', filename);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error parsing ${filename}:`, error);
    return null;
  }
}

function calculateImprovement(baseline: number, optimized: number): string {
  if (baseline === 0) return 'N/A';
  const improvement = ((baseline - optimized) / baseline) * 100;
  const sign = improvement > 0 ? '+' : '';
  return `${sign}${improvement.toFixed(1)}%`;
}

function generateReport(baseline: BenchmarkData, optimized: BenchmarkData): string {
  let report = '';

  report += '# MiCRA Performance Optimization Report\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;

  report += '## Summary\n\n';
  report += `| Metric | Baseline | Optimized | Improvement |\n`;
  report += `|--------|----------|-----------|-------------|\n`;
  report += `| Total Tests | ${baseline.totalTests} | ${optimized.totalTests} | - |\n`;
  report += `| Passed | ${baseline.passed} | ${optimized.passed} | - |\n`;
  report += `| Failed | ${baseline.failed} | ${optimized.failed} | - |\n`;
  report += `| Skipped | ${baseline.skipped} | ${optimized.skipped} | - |\n`;

  report += '\n## Performance Metrics\n\n';

  // Compare test durations
  const baselineTests = new Map(baseline.tests.map(t => [t.name, t]));
  const optimizedTests = new Map(optimized.tests.map(t => [t.name, t]));

  report += `| Test | Baseline (ms) | Optimized (ms) | Improvement |\n`;
  report += `|------|---------------|----------------|-------------|\n`;

  for (const [name, baselineTest] of baselineTests) {
    const optimizedTest = optimizedTests.get(name);
    if (optimizedTest) {
      const improvement = calculateImprovement(baselineTest.duration, optimizedTest.duration);
      report += `| ${name} | ${baselineTest.duration.toFixed(0)} | ${optimizedTest.duration.toFixed(0)} | ${improvement} |\n`;
    }
  }

  report += '\n## Detailed Analysis\n\n';

  // Calculate average improvements
  let totalImprovement = 0;
  let improvementCount = 0;

  for (const [name, baselineTest] of baselineTests) {
    const optimizedTest = optimizedTests.get(name);
    if (optimizedTest && baselineTest.duration > 0) {
      const improvement = ((baselineTest.duration - optimizedTest.duration) / baselineTest.duration) * 100;
      totalImprovement += improvement;
      improvementCount++;
    }
  }

  const avgImprovement = improvementCount > 0 ? totalImprovement / improvementCount : 0;

  report += `**Average Performance Improvement:** ${avgImprovement.toFixed(1)}%\n\n`;

  if (avgImprovement > 50) {
    report += '✅ **Outstanding improvement!** Performance has improved by more than 50% on average.\n\n';
  } else if (avgImprovement > 30) {
    report += '✅ **Significant improvement!** Performance has improved by more than 30% on average.\n\n';
  } else if (avgImprovement > 10) {
    report += '⚠️  **Moderate improvement.** Performance has improved by more than 10% on average.\n\n';
  } else if (avgImprovement > 0) {
    report += '⚠️  **Minor improvement.** Performance has improved slightly.\n\n';
  } else {
    report += '❌ **No improvement detected.** Performance may have regressed.\n\n';
  }

  report += '## Test Results\n\n';

  // List all tests with their status
  report += '### Baseline Results\n\n';
  baseline.tests.forEach(test => {
    const statusEmoji = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️';
    report += `${statusEmoji} **${test.name}**: ${test.duration.toFixed(0)}ms (${test.status})\n`;
  });

  report += '\n### Optimized Results\n\n';
  optimized.tests.forEach(test => {
    const statusEmoji = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️';
    report += `${statusEmoji} **${test.name}**: ${test.duration.toFixed(0)}ms (${test.status})\n`;
  });

  return report;
}

function main() {
  console.log('📊 MiCRA Performance Benchmark Comparison\n');

  const baseline = loadBenchmarkResults('baseline.json');
  const optimized = loadBenchmarkResults('optimized.json');

  if (!baseline) {
    console.log('⚠️  Baseline results not found. Run: pnpm test:perf:baseline');
    process.exit(1);
  }

  if (!optimized) {
    console.log('⚠️  Optimized results not found. Run: pnpm test:perf:optimized');
    process.exit(1);
  }

  console.log('📈 Generating comparison report...\n');

  const report = generateReport(baseline, optimized);

  // Save report as markdown
  const reportPath = path.join(__dirname, '..', 'benchmark-results', 'report.md');
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`✅ Report generated: ${reportPath}\n`);
  console.log('--- Report Preview ---\n');
  console.log(report);

  // Also generate HTML report
  const htmlReport = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>MiCRA Performance Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 1200px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #e5e5e5; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 40px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e5e5; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:hover { background: #fafafa; }
    .improvement-positive { color: #16a34a; font-weight: 600; }
    .improvement-negative { color: #dc2626; font-weight: 600; }
    .status-passed { color: #16a34a; }
    .status-failed { color: #dc2626; }
    .status-skipped { color: #6b7280; }
    pre { background: #f5f5f5; padding: 15px; border-radius: 6px; overflow-x: auto; }
  </style>
</head>
<body>
  ${report.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
</body>
</html>
  `.trim();

  const htmlReportPath = path.join(__dirname, '..', 'benchmark-results', 'report.html');
  fs.writeFileSync(htmlReportPath, htmlReport, 'utf-8');

  console.log(`✅ HTML report generated: ${htmlReportPath}`);
}

main();
