import { test, expect } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";

requireAuthEnv(test);

test("authenticated user can open core pages", async ({ page }) => {
  await login(page);

  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/inventory/);

  await page.goto("/marketplace");
  await expect(page).toHaveURL(/\/marketplace/);

  await page.goto("/profile");
  await expect(page).toHaveURL(/\/profile/);
});
