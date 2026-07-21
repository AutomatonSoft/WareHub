import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";
import {
  exportCsv,
  gotoSofortList,
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

    await expect(sofortRoomFilter(page)).toBeVisible();
    await expect(sofortTypeFilter(page)).toBeVisible();

    const sortButtons = sofortSortButtons(page);
    await sortButtons.first().click();
    await expect(page).toHaveURL(/sort=place/);

    await sortButtons.nth(1).click();
    await expect(page).toHaveURL(/sort=quantity/);
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
