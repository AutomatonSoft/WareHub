import { expect, type Locator, type Page } from "@playwright/test";

export async function gotoSofortList(page: Page, href = "/sofort-list") {
  await page.goto(href);
  await expect(page).toHaveURL(/\/sofort-list/);
}

export async function gotoProfile(page: Page) {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/profile/);
}

export function sofortSearchInput(page: Page): Locator {
  return page.getByLabel("Search in table").first();
}

export function sofortRoomFilter(page: Page): Locator {
  return page.getByLabel("Filter by room");
}

export function sofortTypeFilter(page: Page): Locator {
  return page.getByLabel("Filter by furniture type");
}

export function sofortSortButtons(page: Page): Locator {
  return page.locator("thead button");
}

export async function exportCsv(page: Page) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).first().click();
  return downloadPromise;
}

export async function exportXls(page: Page) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export XLSX" }).first().click();
  return downloadPromise;
}
