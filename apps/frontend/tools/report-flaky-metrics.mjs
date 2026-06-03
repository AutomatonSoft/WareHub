import fs from "node:fs";
import path from "node:path";

function loadReport(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Playwright JSON report not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function walkSuites(suites, visitTest) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        visitTest(test);
      }
    }
    walkSuites(suite.suites || [], visitTest);
  }
}

function computeMetrics(report) {
  let tests = 0;
  let failed = 0;
  let passed = 0;
  let skipped = 0;
  let retries = 0;
  let flakyPassed = 0;

  walkSuites(report.suites || [], (test) => {
    tests += 1;
    const results = Array.isArray(test.results) ? test.results : [];
    retries += Math.max(0, results.length - 1);
    const finalStatus = results.length > 0 ? results[results.length - 1].status : "unknown";
    if (finalStatus === "passed") {
      passed += 1;
      if (results.length > 1) flakyPassed += 1;
      return;
    }
    if (finalStatus === "skipped") {
      skipped += 1;
      return;
    }
    failed += 1;
  });

  return { tests, passed, failed, skipped, retries, flakyPassed };
}

function writeMetrics(metrics) {
  const outputPath = path.join("test-results", "flaky-metrics.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(metrics, null, 2));
  return outputPath;
}

function appendGithubSummary(metrics) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    "### E2E Flaky Metrics",
    "",
    `- tests: ${metrics.tests}`,
    `- passed: ${metrics.passed}`,
    `- failed: ${metrics.failed}`,
    `- skipped: ${metrics.skipped}`,
    `- retries: ${metrics.retries}`,
    `- flaky_passed: ${metrics.flakyPassed}`,
    "",
  ];
  fs.appendFileSync(summaryPath, lines.join("\n"));
}

function main() {
  const reportPath = process.argv[2] || path.join("test-results", "flaky-report.json");
  const report = loadReport(reportPath);
  const metrics = computeMetrics(report);
  const metricsPath = writeMetrics(metrics);
  appendGithubSummary(metrics);
  console.log(`flaky metrics: ${JSON.stringify(metrics)}`);
  console.log(`flaky metrics written: ${metricsPath}`);
}

main();
