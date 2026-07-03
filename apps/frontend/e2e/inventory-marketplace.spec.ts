import { test, expect } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";

requireAuthEnv(test);

test("marketplace page loads and title is visible", async ({ page }) => {
  await login(page);
  await page.goto("/marketplace");
  await expect(page).toHaveURL(/\/marketplace/);
  await expect(page.getByRole("heading", { name: /marketplace/i })).toBeVisible();
});
