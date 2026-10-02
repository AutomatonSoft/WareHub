import { expect, test } from "@playwright/test";

test("XL Create Product keeps independent categories and delivery and publishes three sites", async ({ page }) => {
  const user = { id: "xl-test", login: "admin", username: "admin", role: "admin", status: "approved" };
  const keys = ["XLMOEBEL_DE", "XLMOEBEL_CH", "XLMOEBEL_AT"];
  const published: Array<{ siteKey: string; payload: Record<string, unknown> }> = [];
  let rejectPrice = false;
  await page.context().addCookies([{ name: "sofortbot_refresh_token", value: "test-token", domain: "localhost", path: "/", httpOnly: true }]);
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const siteKey = url.searchParams.get("site_key") ?? keys[0];
    const index = keys.indexOf(siteKey.toUpperCase());
    let body: unknown = {};
    if (path.includes("/auth/refresh")) body = { token: "test-token", user };
    else if (path.includes("/auth/me")) body = user;
    else if (path.endsWith("/marketplace-eans/")) body = { main_ean_jv: "4062292011702", main_ean_xl: "4260533186282" };
    else if (path.endsWith("/kids/2/")) body = { id: 2, kid_number: "xl-test", account: "JV" };
    else if (path.includes("/xl/sites/by-ean/")) body = { found: keys.map((key) => ({ site_key: key, ean: "4062292011702", product_id: 10, domain: "xlmoebel.de" })) };
    else if (path.includes("/xl/products/by-ean/")) body = { ean: "4062292011702", site_key: siteKey, source_product_id: 10, price: "125", specials: [{ price: "100" }], manufacturer_id: 20, descriptions: [{ language_id: 1, name: "XL Chair", description: "<p>Chair</p>" }], categories: [{ category_id: 10, main_category: true }] };
    else if (path.includes("/xl/rubrics/tree")) body = { items: [{ id: index + 10, parent_id: 0, name: `Category ${siteKey}` }] };
    else if (path.includes("/xl/manufacturers/")) body = { items: [{ manufacturer_id: index + 20, name: `Manufacturer ${siteKey}`, delivery_time: `${index + 2} Wochen` }] };
    else if (path.includes("/xl/products/create-and-push")) {
      published.push({ siteKey, payload: route.request().postDataJSON() });
      if (rejectPrice) {
        await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ price: ["A valid number is required."] }) });
        return;
      }
      body = { ok: true };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/create-product?kid=2");
  await page.getByRole("button", { name: /^xl [✓×!]/i }).click();
  await expect(page.locator('input[value="XL Chair"]')).toBeVisible();
  for (const suffix of ["DE", "CH", "AT"]) {
    await page.getByRole("button", { name: new RegExp(`^XL ${suffix} \\d+$`) }).click();
    const category = page.getByText(`Category XLMOEBEL_${suffix}`, { exact: true }).last();
    await expect(category).toBeVisible();
    await page.getByRole("checkbox", { name: new RegExp(`Category XLMOEBEL_${suffix}`) }).first().check();
    await page.getByRole("button", { name: `XL ${suffix}`, exact: true }).click();
    const delivery = page.getByText(new RegExp(`^Manufacturer XLMOEBEL_${suffix}`));
    await expect(delivery).toBeVisible();
    await page.getByRole("checkbox", { name: new RegExp(`^Manufacturer XLMOEBEL_${suffix}`) }).check();
  }
  await page.getByRole("button", { name: /^kaufland jv/i }).click();
  await page.getByRole("button", { name: /^xl [✓×!]/i }).click();
  for (const suffix of ["DE", "CH", "AT"]) {
    await expect(page.getByRole("button", { name: `XL ${suffix} 1`, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: /^create product$/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("XLMOEBEL_CH", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("XLMOEBEL_AT", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: /create.*publish/i }).click();
  await expect.poll(() => published.length).toBe(3);
  for (const [index, publish] of published.entries()) {
    expect(publish.siteKey).toBe(keys[index]);
    expect(publish.payload).toMatchObject({ price: "100", convert_currency: true, source_currency: "EUR", manufacturer_id: index + 20, categories: [{ category_id: index + 10, main_category: true }] });
  }
  rejectPrice = true;
  await page.getByRole("button", { name: /^create product$/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: /create.*publish/i }).click();
  await expect.poll(() => published.length).toBe(6);
  await expect(page.locator('input[name="price"]')).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('input[name="price"]')).toHaveValue("100");
  await expect(page.getByRole("alert").filter({ hasText: "Request failed" })).toContainText("Enter a valid number");
  await page.getByRole("button", { name: /Price: Enter a valid number/ }).click();
  await expect(page.locator('input[name="price"]')).toBeFocused();
  await page.getByRole("button", { name: /^kaufland jv/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Request failed" })).toHaveCount(0);
  await page.getByRole("button", { name: /^xl [✓×!]/i }).click();
  await expect(page.locator('input[name="price"]')).toHaveAttribute("aria-invalid", "true");
  await page.locator('input[name="price"]').fill("101");
  await expect(page.locator('input[name="price"]')).not.toHaveAttribute("aria-invalid", "true");
});

test("XL Product Editor loads site-specific categories and delivery", async ({ page }) => {
  const user = { id: "xl-editor", login: "admin", username: "admin", role: "admin", status: "approved" };
  const keys = ["XLMOEBEL_DE", "XLMOEBEL_CH", "XLMOEBEL_AT"];
  const ean = "4062292011702";
  await page.context().addCookies([{ name: "sofortbot_refresh_token", value: "test-token", domain: "localhost", path: "/", httpOnly: true }]);
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const siteKey = url.searchParams.get("site_key") ?? keys[0];
    const index = keys.indexOf(siteKey.toUpperCase());
    let body: unknown = {};
    if (path.includes("/auth/refresh")) body = { token: "test-token", user };
    else if (path.includes("/auth/me")) body = user;
    else if (path.includes("/gallery-mapping/lookup/")) body = { status: "matched", ean_by_tab: { JV: ean, XL: ean, HOOD_JV: ean, HOOD_XL: ean, OTTO_JV: ean, OTTO_XL: ean, KAUFLAND_JV: ean, KAUFLAND_XL: ean } };
    else if (path.endsWith("/product-editor/discover")) {
      const request = route.request().postDataJSON();
      const group = request.active_group;
      const capabilities = { discover: true, load: true, plan: true, apply: true };
      const targets = group === "XL" ? keys : [request.account ? `${group}_${request.account.toUpperCase()}` : "JV_DE"];
      body = { ean, active_group: group, selected_group_id: group, recommended_baseline_target_id: targets[0], selected_target_ids: targets, groups: [{ id: group, capabilities, targets: targets.map((id) => ({ id, label: id, group, status: group === "XL" ? "found" : "missing", capabilities, warnings: [], metadata: {}, baseline_eligible: true })) }] };
    } else if (path.endsWith("/product-editor/load")) body = {
      ean, active_group: "XL", supported: true, baseline_target_id: keys[0], warnings: [],
      draft: { ean, target_id: keys[0], price: "100", quantity: 1, status: true, descriptions: [{ language_id: 1, name: "Editor XL Chair", description: "<p>Chair</p>" }], categories: [{ category_id: 10, main_category: true }], categories_by_site_key: Object.fromEntries(keys.map((key, siteIndex) => [key, [{ category_id: siteIndex + 10, main_category: true }]])), manufacturer_id: 20, manufacturer_id_by_site_key: Object.fromEntries(keys.map((key, siteIndex) => [key, siteIndex + 20])), jv_fields: {}, images: [] },
    };
    else if (path.includes("/xl/rubrics/tree")) body = { items: [{ id: index + 10, parent_id: 0, name: `Editor category ${siteKey}` }] };
    else if (path.includes("/xl/manufacturers/")) body = { items: [{ manufacturer_id: index + 20, name: `Editor manufacturer ${siteKey}`, delivery_time: "2 Wochen" }, { manufacturer_id: 99, name: `New manufacturer ${siteKey}`, delivery_time: "4 Wochen" }] };
    else if (path.endsWith("/product-editor/plan")) {
      await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: [{ loc: ["body", "draft", "price"], msg: "Input should be a valid number" }] }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/product-editor");
  await page.locator("input").first().fill(ean);
  await page.getByRole("button", { name: "Discover Product", exact: true }).click();
  await page.getByRole("tab", { name: /^XL\b/ }).click();
  await expect(page.getByText("Price currency: EUR.", { exact: false })).toBeVisible();
  for (const suffix of ["DE", "CH", "AT"]) {
    await page.getByRole("button", { name: new RegExp(`^XL ${suffix} \\d+$`) }).click();
    await expect(page.getByRole("checkbox", { name: new RegExp(`Editor category XLMOEBEL_${suffix}`) }).first()).toBeChecked();
    await page.getByRole("button", { name: `XL ${suffix}`, exact: true }).click();
    await expect(page.getByRole("checkbox", { name: new RegExp(`^Editor manufacturer XLMOEBEL_${suffix}`) })).toBeChecked();
  }
  await page.getByRole("button", { name: "XL CH", exact: true }).click();
  await page.getByRole("checkbox", { name: /^New manufacturer XLMOEBEL_CH/ }).check();
  await page.getByRole("button", { name: "XL DE", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /^Editor manufacturer XLMOEBEL_DE/ })).toBeChecked();
  await page.getByRole("button", { name: "XL CH", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /^New manufacturer XLMOEBEL_CH/ })).toBeChecked();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Edit selected sites/ }).click();
  await expect(page.locator('input[name="price"]')).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('input[name="price"]')).toHaveValue("100");
  await expect(page.getByRole("alert").filter({ hasText: "Request failed" })).toContainText("Enter a valid number");
});
