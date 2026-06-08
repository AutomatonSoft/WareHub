import { test, expect } from "@playwright/test";

test("unauthenticated user is redirected from protected route to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /welcome back|create account/i })).toBeVisible();
});

test("login page renders form controls", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByPlaceholder("Login")).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Login$/i })).toBeVisible();
});
