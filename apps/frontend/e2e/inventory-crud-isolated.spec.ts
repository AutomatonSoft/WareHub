import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";

const mutationEnabled = process.env.E2E_MUTATION === "1";

requireAuthEnv(test);
test.skip(!mutationEnabled, "Set E2E_MUTATION=1 to run create/delete e2e with isolated test data.");

test("inventory create/delete with isolated test item", async ({ page }) => {
  const suffix = Date.now();
  const kidNumber = `E2E-KID-${suffix}`;
  const place = `E2E-PLACE-${suffix}`;

  await login(page);
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/inventory/);

  await page.getByRole("button", { name: /add item/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(/kid number/i).fill(kidNumber);
  await dialog.getByPlaceholder(/place/i).fill(place);
  await dialog.getByRole("button", { name: /add item/i }).last().click();

  await expect(page).toHaveURL(new RegExp(`/product-editor\\?kid=${kidNumber}`));

  await page.goto(`/inventory?q=${encodeURIComponent(kidNumber)}`);
  await expect(page).toHaveURL(/\/inventory\?q=/);
  const kidLink = page.getByRole("link", { name: kidNumber }).first();
  await expect(kidLink).toBeVisible({ timeout: 20_000 });

  page.once("dialog", (dialogEvent) => dialogEvent.accept());
  const row = page.locator("tr").filter({ hasText: kidNumber }).first();
  await row.getByRole("button", { name: new RegExp(`delete .*${kidNumber}`, "i") }).click();

  await expect(page.getByRole("link", { name: kidNumber })).toHaveCount(0, { timeout: 20_000 });
});
