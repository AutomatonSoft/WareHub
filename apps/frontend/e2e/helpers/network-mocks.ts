import type { Page, Route } from "@playwright/test";

export async function mockRouteAbort(page: Page, urlPattern: string, errorCode: Parameters<Route["abort"]>[0] = "failed") {
  await page.route(urlPattern, async (route) => {
    await route.abort(errorCode);
  });
}

export async function mockRouteDelayThenContinue(page: Page, urlPattern: string, delayMs: number) {
  await page.route(urlPattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

export async function mockJsonResponse(page: Page, urlPattern: string, status: number, body: unknown) {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}
