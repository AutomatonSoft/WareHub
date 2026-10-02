import { expect, test } from "@playwright/test";

test("Hood JV and XL keep separate edited drafts across marketplace tabs", async ({ page }) => {
  const user = { id: "hood-user", login: "admin", username: "admin", role: "admin", status: "approved" };
  await page.context().addCookies([{ name: "sofortbot_refresh_token", value: "test-token", domain: "localhost", path: "/", httpOnly: true }]);
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = {};
    if (path.includes("/auth/refresh")) body = { token: "test-token", user };
    else if (path.includes("/auth/me")) body = user;
    else if (path.endsWith("/marketplace-eans/")) body = { main_ean_jv: "4062292011702", main_ean_xl: "4260533186282" };
    else if (path.endsWith("/kids/2/")) body = { id: 2, kid_number: "hood-draft-test", account: "JV" };
    else if (path.endsWith("/claim-for-job/")) body = { ean: route.request().postDataJSON().reservation_family === "xl" ? "4071489360493" : "4071489360790" };
    else if (path.includes("/hood/items/by-ean/")) {
      const account = url.searchParams.get("account");
      const item = { title: `Source Hood ${account}`, price: "249", description: `<p>Original ${account}</p>`, quantity: "1", condition: "new", itemMode: "buy_now" };
      body = { items: [item], external_payload: { items: [item] } };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/create-product?kid=2");
  const hoodJv = page.getByRole("button", { name: /^hood jv/i });
  const hoodXl = page.getByRole("button", { name: /^hood xl/i });
  await hoodJv.click();
  const title = page.locator('input').filter({ visible: true }).first();
  await expect(title).toHaveValue("Source Hood jv");
  await title.fill("Edited Hood JV");
  await page.getByRole("combobox").filter({ has: page.locator('option[value="Material"]') }).selectOption("Material");
  await page.getByPlaceholder("Property value").fill("Holz");
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page.locator("textarea").first().fill("<p>Edited JV description</p>");
  await page.getByRole("button", { name: /^kaufland jv/i }).click();
  await hoodJv.click();
  await expect(title).toHaveValue("Edited Hood JV");
  await expect(page.getByPlaceholder("Property value")).toHaveValue("Holz");
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator("textarea").first()).toHaveValue("<p>Edited JV description</p>");
  await hoodXl.click();
  await expect(title).toHaveValue("Source Hood xl");
  await title.fill("Edited Hood XL");
  await hoodJv.click();
  await expect(title).toHaveValue("Edited Hood JV");
  await hoodXl.click();
  await expect(title).toHaveValue("Edited Hood XL");
});
