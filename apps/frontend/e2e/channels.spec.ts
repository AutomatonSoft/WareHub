import { test, expect } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";

requireAuthEnv(test);

test("channels tabs switch and render core controls", async ({ page }) => {
  await login(page);
  await page.goto("/channels");
  await expect(page).toHaveURL(/\/channels/);

  await page.getByRole("button", { name: /Hood/i }).click();
  await expect(page).toHaveURL(/tab=hood/);
  await expect(page.getByText("EAN").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /find|search/i }).first()).toBeVisible();

  await page.getByRole("button", { name: /XL \/ JV/i }).click();
  await expect(page).toHaveURL(/tab=xljv/);
  await expect(page.getByRole("button", { name: /^Search$/i })).toBeVisible();

  await page.getByRole("button", { name: /Kaufland/i }).click();
  await expect(page).toHaveURL(/tab=kaufland/);
  await expect(page.getByRole("button", { name: /Find in Kaufland/i })).toBeVisible();
});
