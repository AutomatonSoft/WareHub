import { orchestratorErrorFixtures } from "./helpers/orchestrator-mocks";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";

requireAuthEnv(test);

async function fillAndSubmitCreateProduct(page: Page) {
  await page.goto("/create-product");
  await expect(page).toHaveURL(/\/create-product/);

  const supportedSiteCheckbox = page.getByRole("checkbox", { name: /hood jv/i });
  await expect(supportedSiteCheckbox).toBeVisible();
  await supportedSiteCheckbox.check();

  await page.getByPlaceholder(/ean/i).first().fill("1234567890123");
  await page.getByPlaceholder(/price/i).first().fill("199.99");
  await page.getByPlaceholder(/product name/i).first().fill("Mars Desk");
  await page.locator("button.ui-button-primary").first().click();
}

test("create product form can be filled and reset without backend mutations", async ({ page }) => {
  await login(page);
  await page.goto("/create-product");
  await expect(page).toHaveURL(/\/create-product/);

  const firstSiteCheckbox = page.locator('input[type="checkbox"]').first();
  await expect(firstSiteCheckbox).toBeVisible();
  await firstSiteCheckbox.check();

  const eanInput = page.getByPlaceholder(/ean/i).first();
  const priceInput = page.getByPlaceholder(/price/i).first();

  await eanInput.fill("1234567890123");
  await priceInput.fill("199.99");
  await page.getByRole("button", { name: /reset/i }).first().click();

  await expect(eanInput).toHaveValue("");
  await expect(priceInput).toHaveValue("");
});

test("create product shows partial success status from orchestrator", async ({ page }) => {
  await login(page);

  await page.route("**/api/v1/orchestrator/products/*/update", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        request_id: "req-e2e-1",
        status: "partial_success",
        results: [
          { marketplace: "hood", target: "hood,account=jv", status: "success", status_code: 200, data: { ok: true } },
          {
            marketplace: "kaufland",
            target: "kaufland,account=jv",
            status: "failed",
            status_code: 502,
            error: {
              code: "orchestrator_channel_request_failed",
              message: "Marketplace adapter returned non-success status",
              request_id: "req-e2e-1",
              details: {}
            }
          }
        ]
      })
    });
  });

  await fillAndSubmitCreateProduct(page);

  await expect(page.getByText(/Orchestrator: partial success/i)).toBeVisible();
  await expect(page.getByText(/kaufland: 502\/orchestrator_channel_request_failed/i)).toBeVisible();
});

for (const fixture of orchestratorErrorFixtures) {
  test(`create product handles orchestrator fixture: ${fixture.name}`, async ({ page }) => {
    await login(page);

    await page.route("**/api/v1/orchestrator/products/*/update", async (route) => {
      await route.fulfill({
        status: fixture.httpStatus,
        contentType: "application/json",
        body: JSON.stringify(fixture.response)
      });
    });

    await fillAndSubmitCreateProduct(page);

    if (fixture.name === "orchestrator_proxy_failed") {
      await expect(page.getByText(/Mocked proxy failure/i)).toBeVisible();
      return;
    }

    if (fixture.name === "orchestrator_request_validation_failed") {
      await expect(page.getByText(/Mocked request validation failure/i)).toBeVisible();
      return;
    }

    if (fixture.name === "orchestrator_ean_empty") {
      await expect(page.getByText(/Mocked empty ean/i)).toBeVisible();
      return;
    }

    const code =
      fixture.name === "orchestrator_unknown_code_fallback"
        ? "orchestrator_future_new_code"
        : fixture.name;
    await expect(page.getByText(new RegExp(code, "i"))).toBeVisible();
  });
}

test("inventory row opens kid details page", async ({ page }) => {
  await login(page);
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/inventory/);

  const kidLink = page.locator('a[href^="/inventory/kid/"]').filter({ visible: true }).first();
  await expect(kidLink).toBeVisible({ timeout: 15_000 });
  await kidLink.scrollIntoViewIfNeeded();
  await kidLink.click();

  await expect(page).toHaveURL(/\/inventory\/kid\/\d+/);
  await expect(page.locator('a[href="/inventory"]').first()).toBeVisible();
});
