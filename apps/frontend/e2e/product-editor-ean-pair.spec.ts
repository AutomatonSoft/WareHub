import { expect, test } from "@playwright/test";

for (const input of ["4062292011702", "4260533186282"]) {
  test(`discovery routes both EAN directions and excludes eBay: ${input}`, async ({ page }) => {
    const user = { id: "pair-user", login: "admin", username: "admin", role: "admin", status: "approved" };
    const calls: Array<{ ean: string; active_group: string; account: string | null }> = [];
    const loads: Array<{ ean: string; baseline_target_id: string }> = [];
    const jv = "4062292011702";
    const xl = "4260533186282";
    await page.context().addCookies([{ name: "sofortbot_refresh_token", value: "test-token", domain: "localhost", path: "/", httpOnly: true }]);
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = {};
      if (path.includes("/auth/refresh")) body = { token: "test-token", user };
      else if (path.includes("/auth/me")) body = user;
      else if (path.includes("/gallery-mapping/lookup/")) {
        expect(new URL(route.request().url()).searchParams.get("ean")).toBe(input);
        body = { status: "matched", ean_by_tab: {
          JV: jv, XL: jv, HOOD_JV: jv, HOOD_XL: xl, OTTO_JV: jv, OTTO_XL: xl, KAUFLAND_JV: jv, KAUFLAND_XL: xl
        } };
      } else if (path.endsWith("/product-editor/discover")) {
        const request = route.request().postDataJSON();
        calls.push(request);
        const group = request.active_group;
        const targetId = request.account ? `${group}_${request.account.toUpperCase()}` : group === "XL" ? "XLMOEBEL_DE" : "JV_DE";
        const capabilities = { discover: true, load: true, plan: true, apply: true, job_status: true };
        body = { ean: request.ean, selected_group_id: group, selected_target_ids: [targetId], recommended_baseline_target_id: targetId, warnings: [],
          groups: [{ id: group, label: group, capabilities, targets: [{ id: targetId, label: targetId, group,
            account_family: request.account, status: group === "KAUFLAND" ? "found" : "missing", capabilities, warnings: [], metadata: {}, baseline_eligible: true }] }] };
      } else if (path.endsWith("/product-editor/load")) {
        const request = route.request().postDataJSON();
        loads.push(request);
        body = { supported: true, draft: { target_id: request.baseline_target_id, ean: request.ean, title: "Paired XL product", controller: "xl" }, warnings: [] };
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto("/product-editor");
    await page.locator("input").first().fill(input);
    await page.getByRole("button", { name: "Discover Product", exact: true }).click();
    await expect.poll(() => calls.length).toBe(8);
    for (const call of calls) {
      expect(call.active_group).not.toBe("EBAY");
      expect(call.ean).toBe(call.account === "xl" ? xl : jv);
    }
    await expect(page.getByRole("tab", { name: /ebay/i })).toHaveCount(0);
    await page.getByRole("tab", { name: /kaufland xl/i }).click();
    await expect.poll(() => loads.length).toBe(1);
    expect(loads[0]).toMatchObject({ ean: xl, baseline_target_id: "KAUFLAND_XL" });
    await expect(page.locator('input[value="Paired XL product"]')).toHaveCount(1);
  });
}

test("ambiguous mapping blocks marketplace discovery", async ({ page }) => {
  const user = { id: "pair-user", login: "admin", username: "admin", role: "admin", status: "approved" };
  let discoveries = 0;
  await page.context().addCookies([{ name: "sofortbot_refresh_token", value: "test-token", domain: "localhost", path: "/", httpOnly: true }]);
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.includes("/auth/refresh")) body = { token: "test-token", user };
    else if (path.includes("/auth/me")) body = user;
    else if (path.includes("/gallery-mapping/lookup/")) body = { status: "ambiguous", ean_by_tab: {} };
    else if (path.endsWith("/product-editor/discover")) discoveries++;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/product-editor");
  await page.locator("input").first().fill("4062292011702");
  await page.getByRole("button", { name: "Discover Product", exact: true }).click();
  await expect(page.getByRole("alert").getByText("Multiple JV–XL EAN pairs found. Discovery was not started.")).toBeVisible();
  expect(discoveries).toBe(0);
});
