import test from "node:test";
import assert from "node:assert/strict";
import { buildEanUsageTimelineRows } from "../components/inventory/ean-usage-model.mjs";

test("ean usage model maps usage rows and sorts newest first", () => {
  const rows = buildEanUsageTimelineRows([
    {
      event: "reserved",
      status: "ok",
      marketplace: "xljv",
      account: "JV",
      kid_id: 77,
      site: "XL",
      site_key: "SHOP_DE",
      local_product_id: 123,
      source_product_id: "abc",
      published_at: "2026-01-01T00:00:00Z"
    },
    {
      event: "used",
      status: "ok",
      marketplace: "hood",
      account: "DE",
      kid_id: 77,
      site: "XL",
      site_key: "SHOP_DE",
      local_product_id: 124,
      source_product_id: "def",
      published_at: "2026-02-01T00:00:00Z"
    }
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].event, "used");
  assert.equal(rows[0].eventAt, "2026-02-01T00:00:00Z");
  assert.equal(rows[0].marketplace, "hood");
  assert.equal(rows[0].account, "DE");
  assert.equal(rows[0].kidId, "77");
  assert.equal(rows[0].site, "XL");
  assert.equal(rows[0].siteKey, "SHOP_DE");
  assert.equal(rows[0].localProductId, "124");
});

test("ean usage model ignores invalid records", () => {
  const rows = buildEanUsageTimelineRows([null, 1, "x"]);
  assert.deepEqual(rows, []);
});
