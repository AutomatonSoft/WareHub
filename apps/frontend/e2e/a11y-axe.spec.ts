import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, requireAuthEnv } from "./helpers/auth";

requireAuthEnv(test);

async function expectNoSeriousA11yViolations(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const seriousViolations = result.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical"
  );
  expect(
    seriousViolations,
    seriousViolations.map((v) => `${v.id}: ${v.help}`).join("\n")
  ).toEqual([]);
}

test("dashboard page has no serious/critical axe violations", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expectNoSeriousA11yViolations(page);
});
