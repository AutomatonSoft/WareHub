import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";
import { mockRouteAbort } from "./helpers/network-mocks";

requireAuthEnv(test);

test("inventory shows error state when services API is unavailable", async ({ page }) => {
  await mockRouteAbort(page, "**/inventory/rows/**", "failed");

  await login(page);
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/inventory/);

  await expect(page.getByText(/something went wrong/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
});

test("sofort-list shows error state when services API is unavailable", async ({ page }) => {
  await mockRouteAbort(page, "**/inventory/rows/**", "failed");

  await login(page);
  await page.goto("/sofort-list");
  await expect(page).toHaveURL(/\/sofort-list/);

  await expect(page.getByText(/something went wrong/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
});
