import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";
import {
  gotoInventory,
  gotoSofortList,
  inventorySearchInput,
  sofortListingFilter,
  sofortRoomFilter,
  sofortSearchInput,
  sofortTypeFilter,
} from "./helpers/table-pages";

requireAuthEnv(test);

test("inventory toolbar search is keyboard-focusable and labelled", async ({ page }) => {
  await login(page);
  await gotoInventory(page);

  const searchInput = inventorySearchInput(page);
  await expect(searchInput).toBeVisible();
  await searchInput.focus();
  await expect(searchInput).toBeFocused();

  await searchInput.fill("12");
  const clearButton = page.getByRole("button", { name: "Clear search" }).first();
  await expect(clearButton).toBeVisible();
  await clearButton.focus();
  await expect(clearButton).toBeFocused();
});

test("sofort-list filters are keyboard-focusable and have ARIA labels", async ({ page }) => {
  await login(page);
  await gotoSofortList(page);

  const searchInput = sofortSearchInput(page);
  const roomFilter = sofortRoomFilter(page);
  const typeFilter = sofortTypeFilter(page);
  const listingFilter = sofortListingFilter(page);

  await expect(searchInput).toBeVisible();
  await expect(roomFilter).toBeVisible();
  await expect(typeFilter).toBeVisible();
  await expect(listingFilter).toBeVisible();

  await searchInput.focus();
  await expect(searchInput).toBeFocused();

  await roomFilter.focus();
  await expect(roomFilter).toBeFocused();

  await typeFilter.focus();
  await expect(typeFilter).toBeFocused();

  await listingFilter.focus();
  await expect(listingFilter).toBeFocused();
});
