import { expect, test } from "@playwright/test";

test("admin queues mapping and sees persisted progress after reopening", async ({ page }) => {
  const user = { id: "mapping-admin", login: "admin", username: "admin", role: "admin", status: "approved" };
  let job = {
    job_id: null as string | null, status: "idle", phase: "idle", error: null, recovering: false,
    updated_at: null, jv_loaded: 0, xl_loaded: 0, mapped: 0, jv_complete: false, xl_complete: false
  };
  let starts = 0;
  await page.context().addCookies([{
    name: "sofortbot_refresh_token", value: "test-token", domain: "localhost", path: "/", httpOnly: true
  }]);
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.includes("/auth/refresh")) body = { token: "test-token", user };
    else if (path.includes("/auth/me")) body = user;
    else if (path.includes("/admin/users")) body = [];
    else if (path.includes("/gallery-mapping/")) {
      if (route.request().method() === "POST") {
        expect(route.request().headers()["x-csrftoken"]).toBe("mock-csrf-token");
        starts++;
        job = { ...job, job_id: "test-job", status: "queued", phase: "queued" };
      }
      body = { configured: true, missing: [], job, csrf_token: "mock-csrf-token" };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/admin/users");
  const start = page.getByRole("button", { name: "Start / resume" });
  await expect(start).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await start.click();
  await expect(page.getByText("Queued. An Aftercool mapping worker must be running.")).toBeVisible();
  await expect(start).toBeDisabled();
  expect(starts).toBe(1);
  job = { ...job, status: "running", phase: "xl_cache", jv_loaded: 1000, xl_loaded: 500 };
  await page.reload();
  await expect(page.getByText("Loading XL", { exact: true })).toBeVisible();
  await expect(page.getByText("1,000", { exact: true })).toBeVisible();
  job = { ...job, status: "completed", phase: "completed", mapped: 1000 };
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start / resume" })).toBeEnabled();
});
