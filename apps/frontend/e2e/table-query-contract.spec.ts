import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";
import { gotoInventory, gotoSofortList } from "./helpers/table-pages";

requireAuthEnv(test);
test.describe.configure({ mode: "serial" });

test("inventory URL state and backend pagination params stay in sync", async ({ page }) => {
  await login(page);

  const requestPromise = page.waitForRequest((request) => {
    if (!request.url().includes("/inventory/rows/")) return false;
    const url = new URL(request.url());
    return url.searchParams.get("page") === "2";
  });

  await gotoInventory(page, "/inventory?q=chair&page=2&place_sort=desc");
  await expect(page).toHaveURL(/\/inventory\?q=chair&page=2&place_sort=desc/);

  const request = await requestPromise;
  const apiUrl = new URL(request.url());
  expect(apiUrl.searchParams.get("page")).toBe("2");
  expect(apiUrl.searchParams.get("page_size")).toBe("100");
});

test("sofort-list URL state is forwarded to backend query params", async ({ page }) => {
  await login(page);

  const requestPromise = page.waitForRequest((request) => {
    if (!request.url().includes("/inventory/rows/")) return false;
    const url = new URL(request.url());
    return (
      url.searchParams.get("q") === "2" &&
      url.searchParams.get("listing") === "listed" &&
      url.searchParams.get("sort") === "quantity" &&
      url.searchParams.get("dir") === "desc" &&
      url.searchParams.get("page") === "2"
    );
  });

  await gotoSofortList(page, "/sofort-list?q=2&listing=listed&sort=quantity&dir=desc&page=2");
  await expect(page).toHaveURL(/\/sofort-list\?q=2&listing=listed&sort=quantity&dir=desc&page=2/);

  const request = await requestPromise;
  const apiUrl = new URL(request.url());
  expect(apiUrl.searchParams.get("q")).toBe("2");
  expect(apiUrl.searchParams.get("listing")).toBe("listed");
  expect(apiUrl.searchParams.get("sort")).toBe("quantity");
  expect(apiUrl.searchParams.get("dir")).toBe("desc");
  expect(apiUrl.searchParams.get("page")).toBe("2");
  expect(apiUrl.searchParams.get("page_size")).toBe("100");
});
