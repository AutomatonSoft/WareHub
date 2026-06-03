import { test, expect } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";
import { gotoInventory, inventorySearchInput } from "./helpers/table-pages";

requireAuthEnv(test);

test("inventory page loads and search input is visible", async ({ page }) => {
  await login(page);
  await gotoInventory(page);
  await expect(page.getByRole("heading", { name: /inventory/i })).toBeVisible();
  await expect(inventorySearchInput(page)).toBeVisible();
});

test("marketplace page loads and title is visible", async ({ page }) => {
  await login(page);
  await page.goto("/marketplace");
  await expect(page).toHaveURL(/\/marketplace/);
  await expect(page.getByRole("heading", { name: /marketplace/i })).toBeVisible();
});
