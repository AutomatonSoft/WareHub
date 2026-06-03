import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:8931";
const jsonReportFile = process.env.PW_JSON_REPORT_FILE;

const reporter: Parameters<typeof defineConfig>[0]["reporter"] = jsonReportFile
  ? [["list"], ["json", { outputFile: jsonReportFile }]]
  : [["list"]];

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01
    }
  },
  fullyParallel: true,
  reporter,
  use: {
    baseURL,
    trace: "retain-on-failure",
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light"
  },
  projects: [
    {
      name: "chromium",
      grepInvert: /@flaky/i,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "chromium-flaky",
      grep: /@flaky/i,
      retries: process.env.CI ? 4 : 1,
      timeout: 45_000,
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:8931",
        reuseExistingServer: true,
        timeout: 120_000
      }
});
