import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";

requireAuthEnv(test);

test("cross-channel navigation flow keeps core controls available", async ({ page }) => {
  await login(page);

  await page.goto("/channels?tab=hood");
  await expect(page).toHaveURL(/\/channels\?tab=hood/);
  await expect(page.getByPlaceholder("EAN").first()).toBeVisible();

  await page.getByRole("button", { name: /XL \/ JV/i }).click();
  await expect(page).toHaveURL(/tab=xljv/);
  await expect(page.getByRole("button", { name: /^Search$/i })).toBeVisible();

  await page.goto("/marketplace");
  await expect(page).toHaveURL(/\/marketplace/);
  await expect(page.getByRole("button", { name: /sync/i })).toBeVisible();

  await page.goto("/channels?tab=kaufland");
  await expect(page).toHaveURL(/tab=kaufland/);
  await expect(page.getByRole("button", { name: /Find in Kaufland/i })).toBeVisible();
});
