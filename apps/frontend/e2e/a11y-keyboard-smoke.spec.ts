import { test, expect } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";

requireAuthEnv(test);

test("sofort-list presets are keyboard-focusable and labelled", async ({ page }) => {
  await login(page);
  await page.goto("/sofort-list");
  await expect(page).toHaveURL(/\/sofort-list/);

  const presetName = page.getByLabel("Preset name").first();
  await expect(presetName).toBeVisible();
  await presetName.focus();
  await expect(presetName).toBeFocused();

  const presetSelect = page.getByLabel("Choose preset").first();
  await expect(presetSelect).toBeVisible();
  await presetSelect.focus();
  await expect(presetSelect).toBeFocused();
});
