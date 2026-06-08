import test from "node:test";
import assert from "node:assert/strict";
import { normalizeKidEanSummaryPayload } from "../components/inventory/kid-ean-summary-model.mjs";

test("kid ean summary model normalizes payload", () => {
  const model = normalizeKidEanSummaryPayload(
    {
      kid_id: 10,
      kid_number: " KID-10 ",
      order_ids: ["ORDER-1", " ORDER-2 "],
      order_count: 2,
      sku_eans: ["4006381333931", " 4006381333931 ", 5901234123457],
      sku_ean_count: 2,
      has_ean: true,
      linked_products_by_ean: {
        xljv_services: { "4006381333931": [{ id: 1 }] },
        hood_service: { "5901234123457": [{ id: 2 }] }
      },
      listing_summary: {
        xljv_services: { total: 1, sites: ["JV"], source_product_ids: ["501"] },
        hood_service: { total: 1, accounts: ["JV"] }
      },
      kid_snapshot: {
        place: "A-01",
        room: "ROOM-1",
        furniture_type: "chair",
        listing_status: "listed",
        main_photo: "https://cdn.example.com/a.jpg",
        photo_count: 1,
        last_update: "2026-05-18T08:00:00Z"
      }
    },
    99
  );

  assert.equal(model.kidId, 10);
  assert.equal(model.kidNumber, "KID-10");
  assert.deepEqual(model.orderIds, ["ORDER-1", "ORDER-2"]);
  assert.equal(model.orderCount, 2);
  assert.deepEqual(model.skuEans, ["4006381333931", "5901234123457"]);
  assert.equal(model.skuEanCount, 2);
  assert.equal(model.hasEan, true);
  assert.equal(Array.isArray(model.linkedProductsByEan.xljv_services["4006381333931"]), true);
  assert.equal(model.listingSummary.xljv_services.total, 1);
  assert.deepEqual(model.listingSummary.xljv_services.sites, ["JV"]);
  assert.equal(model.kidSnapshot.place, "A-01");
  assert.equal(model.kidSnapshot.mainPhoto, "https://cdn.example.com/a.jpg");
});

test("kid ean summary model falls back safely for invalid payload", () => {
  const model = normalizeKidEanSummaryPayload(null, 77);
  assert.equal(model.kidId, 77);
  assert.equal(model.kidNumber, "");
  assert.deepEqual(model.orderIds, []);
  assert.equal(model.orderCount, 0);
  assert.deepEqual(model.skuEans, []);
  assert.equal(model.skuEanCount, 0);
  assert.equal(model.hasEan, false);
  assert.deepEqual(model.linkedProductsByEan, { xljv_services: {}, hood_service: {} });
  assert.equal(model.listingSummary.xljv_services.total, 0);
  assert.equal(model.kidSnapshot.place, "");
});
