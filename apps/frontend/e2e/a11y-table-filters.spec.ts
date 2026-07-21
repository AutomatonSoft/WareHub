import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";
import {
  gotoSofortList,
  sofortRoomFilter,
  sofortSearchInput,
  sofortTypeFilter,
} from "./helpers/table-pages";

requireAuthEnv(test);

test("sofort-list filters are keyboard-focusable and have ARIA labels", async ({ page }) => {
  await login(page);
  await gotoSofortList(page);

  const searchInput = sofortSearchInput(page);
  const roomFilter = sofortRoomFilter(page);
  const typeFilter = sofortTypeFilter(page);

  await expect(searchInput).toBeVisible();
  await expect(roomFilter).toBeVisible();
  await expect(typeFilter).toBeVisible();

  await searchInput.focus();
  await expect(searchInput).toBeFocused();

  await roomFilter.focus();
  await expect(roomFilter).toBeFocused();

  await typeFilter.focus();
  await expect(typeFilter).toBeFocused();
});
