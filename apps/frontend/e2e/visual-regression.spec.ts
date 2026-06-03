import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";

const visualEnabled = process.env.E2E_VISUAL === "1";

requireAuthEnv(test);
test.skip(!visualEnabled, "Set E2E_VISUAL=1 to run visual regression snapshots.");

test.describe("visual regression", () => {
  test.describe.configure({ mode: "serial" });

  test("inventory page snapshot", async ({ page }) => {
    await login(page);
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/inventory/);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("inventory-page.png", {
      fullPage: true,
      animations: "disabled"
    });
  });

  test("inventory page mobile snapshot", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/inventory/);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("inventory-page-mobile.png", {
      fullPage: true,
      animations: "disabled"
    });
  });

  test("sofort list page snapshot", async ({ page }) => {
    await login(page);
    await page.goto("/sofort-list");
    await expect(page).toHaveURL(/\/sofort-list/);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("sofort-list-page.png", {
      fullPage: true,
      animations: "disabled"
    });
  });

  test("sofort list page mobile snapshot", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto("/sofort-list");
    await expect(page).toHaveURL(/\/sofort-list/);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("sofort-list-page-mobile.png", {
      fullPage: true,
      animations: "disabled"
    });
  });

  test("marketplace page snapshot", async ({ page }) => {
    await login(page);
    await page.goto("/marketplace");
    await expect(page).toHaveURL(/\/marketplace/);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("marketplace-page.png", {
      fullPage: true,
      animations: "disabled"
    });
  });
});
