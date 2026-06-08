import { test, expect } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";
import { gotoProfile, gotoSofortList, sofortSearchInput } from "./helpers/table-pages";

requireAuthEnv(test);

test("profile page renders account form controls", async ({ page }) => {
  await login(page);
  await gotoProfile(page);
  await expect(page.getByRole("heading", { name: /profile/i }).first()).toBeVisible();
  await expect(page.getByPlaceholder("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: /save profile/i })).toBeVisible();
});

test("sofort-list page renders search and filter controls", async ({ page }) => {
  await login(page);
  await gotoSofortList(page);
  await expect(page.getByRole("heading", { name: /sofort list/i }).first()).toBeVisible();
  await expect(sofortSearchInput(page)).toBeVisible();
  await expect(page.getByRole("combobox").first()).toBeVisible();
});
