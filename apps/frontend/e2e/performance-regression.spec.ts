import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";

const perfEnabled = process.env.E2E_PERF === "1";

requireAuthEnv(test);
test.skip(!perfEnabled, "Set E2E_PERF=1 to run performance regression checks.");

type NavigationMetrics = {
  url: string;
  domContentLoadedMs: number;
  loadEventMs: number;
  firstByteMs: number;
};

async function getNavigationMetrics(page: import("@playwright/test").Page): Promise<NavigationMetrics> {
  return page.evaluate(() => {
    const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return {
      url: window.location.pathname,
      domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd - entry.startTime),
      loadEventMs: Math.round(entry.loadEventEnd - entry.startTime),
      firstByteMs: Math.round(entry.responseStart - entry.requestStart)
    };
  });
}

test("login page performance budget", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);
  const metrics = await getNavigationMetrics(page);

  expect(metrics.firstByteMs, `TTFB too high for ${metrics.url}`).toBeLessThan(1200);
  expect(metrics.domContentLoadedMs, `DCL too high for ${metrics.url}`).toBeLessThan(3500);
  expect(metrics.loadEventMs, `Load event too high for ${metrics.url}`).toBeLessThan(6000);
});
