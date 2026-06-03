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

test("inventory page performance budget", async ({ page }) => {
  await login(page);
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/inventory/);
  const metrics = await getNavigationMetrics(page);

  expect(metrics.firstByteMs, `TTFB too high for ${metrics.url}`).toBeLessThan(1500);
  expect(metrics.domContentLoadedMs, `DCL too high for ${metrics.url}`).toBeLessThan(4500);
  expect(metrics.loadEventMs, `Load event too high for ${metrics.url}`).toBeLessThan(8000);
});

test("inventory search interaction budget", async ({ page }) => {
  await login(page);
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/inventory/);

  const searchInput = page.getByLabel("Search in table").first();
  await expect(searchInput).toBeVisible();

  const startedAt = Date.now();
  await searchInput.fill("2");
  await expect(page).toHaveURL(/\/inventory\?q=2/, { timeout: 5000 });
  const interactionMs = Date.now() - startedAt;

  expect(interactionMs, "Inventory search interaction is too slow").toBeLessThan(2000);
});

test("sofort-list filter interaction budget", async ({ page }) => {
  await login(page);
  await page.goto("/sofort-list");
  await expect(page).toHaveURL(/\/sofort-list/);

  const listingFilter = page.getByLabel("Filter by listing status");
  await expect(listingFilter).toBeVisible();

  const requestPromise = page.waitForRequest((request) => {
    if (!request.url().includes("/inventory/rows/")) return false;
    const url = new URL(request.url());
    return url.searchParams.get("listing") === "listed";
  }, { timeout: 8000 });

  const startedAt = Date.now();
  await listingFilter.selectOption("listed");
  await requestPromise;
  const interactionMs = Date.now() - startedAt;

  expect(interactionMs, "Sofort-list filter interaction is too slow").toBeLessThan(3000);
});
