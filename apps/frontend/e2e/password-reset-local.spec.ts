import { expect, test } from "@playwright/test";

test("password reset request succeeds locally without Failed to fetch", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /forgot password\?/i }).click();
  await page.getByPlaceholder("Email").fill("2rraykhanov2@gmail.com");
  const resetResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === "http://localhost:8932/api/v1/auth/password/reset/request" &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /send reset code/i }).click();
  const resetResponse = await resetResponsePromise;

  await expect(page.getByRole("status")).toContainText("Reset code sent. Check your email.");
  const resetForm = page.locator("form").filter({ has: page.getByRole("button", { name: /reset password/i }) });
  await expect(resetForm).toBeVisible();
  await expect(page.getByText(/Failed to fetch/i)).toHaveCount(0);
  expect(resetResponse.status()).toBe(204);
});

test("password reset confirm shows toast for invalid code", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /forgot password\?/i }).click();
  await page.getByPlaceholder("Email").fill("2rraykhanov2@gmail.com");
  await page.getByRole("button", { name: /send reset code/i }).click();
  await expect(page.getByRole("status")).toContainText("Reset code sent. Check your email.");

  await page.getByPlaceholder("Reset code").fill("000000");
  await page.getByPlaceholder("New password").fill("Password1");
  await page.getByPlaceholder("Confirm password").fill("Password1");

  const confirmResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === "http://localhost:8932/api/v1/auth/password/reset/confirm" &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /^reset password$/i }).click();
  const confirmResponse = await confirmResponsePromise;

  expect(confirmResponse.status()).toBe(400);
  await expect(page.locator(".ui-toast[role='alert']")).toContainText("Reset code is invalid.");
});
