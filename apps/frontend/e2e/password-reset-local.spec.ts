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

  const resetForm = page.locator("form").filter({ has: page.getByRole("button", { name: /reset password/i }) });
  await expect(resetForm).toContainText("If the email exists, a reset code was sent.");
  await expect(resetForm).toContainText("In local dev, check logs/local-dev/backend.log for the code.");
  await expect(page.getByText(/Failed to fetch/i)).toHaveCount(0);
  expect(resetResponse.status()).toBe(204);
});
