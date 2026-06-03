import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";

requireAuthEnv(test);

test("xljv edit page handles missing ean in url", async ({ page }) => {
  await login(page);
  await page.goto("/xl-jv/edit");
  await expect(page).toHaveURL(/\/xl-jv\/edit/);
  await expect(page.getByText(/ean/i).first()).toBeVisible();
});

test("xljv edit page with ean renders either form or error state", async ({ page }) => {
  await login(page);
  await page.goto("/xl-jv/edit?ean=1234567890123&site=XL");
  await expect(page).toHaveURL(/\/xl-jv\/edit\?ean=1234567890123/);

  const saveButton = page.getByRole("button", { name: /save/i }).first();
  const errorCard = page.getByText(/failed|error|no data|request|sync/i).first();
  await expect(saveButton.or(errorCard)).toBeVisible({ timeout: 15_000 });
});
