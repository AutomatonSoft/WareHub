import { expect, type Page } from "@playwright/test";

const loginValue = process.env.E2E_LOGIN;
const password = process.env.E2E_PASSWORD;
const bypassAuth = process.env.E2E_BYPASS_AUTH === "1";

export function requireAuthEnv(test: { skip: (condition: boolean, description?: string) => void }) {
  test.skip(
    !bypassAuth && (!loginValue || !password),
    "Set E2E_LOGIN and E2E_PASSWORD to run authenticated e2e tests, or set E2E_BYPASS_AUTH=1."
  );
}

function trimForLog(value: string, max = 500): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export async function login(page: Page) {
  if (bypassAuth) {
    await page.context().addCookies([
      {
        name: "sofortbot_token",
        value: "e2e-bypass-token",
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax"
      }
    ]);
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile/);
    return;
  }

  await page.goto("/login");
  await page.getByPlaceholder("Login").fill(loginValue || "");
  await page.getByPlaceholder("Password").fill(password || "");
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/v1/auth/login") && response.request().method() === "POST",
    { timeout: 12_000 }
  ).catch(() => null);

  await page.locator("form").getByRole("button", { name: /^Login$/i }).click();

  const loginResponse = await loginResponsePromise;
  const navigated = await page
    .waitForURL(/\/(profile|dashboard)/, { timeout: 12_000 })
    .then(() => true)
    .catch(() => false);

  if (navigated) {
    return;
  }

  const currentUrl = page.url();
  const loginErrorText = (await page.locator("form").innerText().catch(() => "")).trim();
  if (!loginResponse) {
    throw new Error(
      `E2E login failed: no /api/v1/auth/login response captured. current_url=${currentUrl}; form_text="${trimForLog(loginErrorText)}"`
    );
  }

  const status = loginResponse.status();
  const responseBody = await loginResponse.text().catch(() => "");
  throw new Error(
    `E2E login failed: HTTP ${status}; current_url=${currentUrl}; response_body="${trimForLog(responseBody)}"; form_text="${trimForLog(loginErrorText)}"`
  );
}
