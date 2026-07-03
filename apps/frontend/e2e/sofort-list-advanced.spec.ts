import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";
import {
  exportCsv,
  gotoSofortList,
  sofortListingFilter,
  sofortRoomFilter,
  sofortSearchInput,
  sofortSortButtons,
  sofortTypeFilter,
} from "./helpers/table-pages";

requireAuthEnv(test);
test.describe.configure({ mode: "serial" });

test.describe("sofort-list advanced flows", () => {
  test("search, filters and sorting update URL state", async ({ page }) => {
    await login(page);
    await gotoSofortList(page);

    const searchInput = sofortSearchInput(page);
    await searchInput.fill("2");
    await expect(page).toHaveURL(/q=2/);

    await sofortListingFilter(page).selectOption("listed");
    await expect(page).toHaveURL(/listing=listed/);

    await expect(sofortRoomFilter(page)).toBeVisible();
    await expect(sofortTypeFilter(page)).toBeVisible();

    const sortButtons = sofortSortButtons(page);
    await sortButtons.first().click();
    await expect(page).toHaveURL(/sort=place/);

    await sortButtons.nth(1).click();
    await expect(page).toHaveURL(/sort=quantity/);
  });

  test("bulk update sends backend request", async ({ page }) => {
    await login(page);
    await gotoSofortList(page);

    const rowCheckbox = page.locator('tbody input[type="checkbox"]').first();
    await rowCheckbox.check();
    await expect(page.getByText(/selected/i)).toBeVisible();

    const reqPromise = page.waitForRequest((request) => {
      return request.method() === "PATCH" && request.url().includes("/kids/bulk-update/");
    });
    const resPromise = page.waitForResponse((response) => {
      return response.request().method() === "PATCH" && response.url().includes("/kids/bulk-update/");
    });

    await page.getByRole("button", { name: "Set listed" }).click();

    const req = await reqPromise;
    const body = req.postDataJSON() as { updates?: Array<{ kid_id?: number; listing_status?: string }> };
    expect(Array.isArray(body.updates)).toBeTruthy();
    expect((body.updates?.length ?? 0) > 0).toBeTruthy();
    expect(typeof body.updates?.[0]?.kid_id).toBe("number");
    expect(body.updates?.[0]?.listing_status).toBe("listed");

    const res = await resPromise;
    expect(res.ok()).toBeTruthy();
  });

  test("export CSV triggers file download", async ({ page }) => {
    await login(page);
    await gotoSofortList(page);

    const downloadPromise = exportCsv(page);
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".csv");
  });
});

test.describe("sofort-list mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("renders mobile cards", async ({ page }) => {
    await login(page);
    await gotoSofortList(page);

    await expect(page.locator(".wh-sofort-table-row").first()).toBeVisible();
  });
});
