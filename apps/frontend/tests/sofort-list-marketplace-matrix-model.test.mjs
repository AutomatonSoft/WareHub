import test from "node:test";
import assert from "node:assert/strict";

import { buildMarketplaceMatrixRows } from "../components/inventory/sofort-list/sofort-list-marketplace-matrix-model.mjs";

test("marketplace matrix model marks matched market and exact cells", () => {
  const rows = buildMarketplaceMatrixRows(
    {
      jv: "1111111111111",
      xl: "2222222222222",
      ottoJv: "3333333333333",
      ottoXl: "4444444444444",
      ebayJv: "5555555555555",
      ebayXl: "6666666666666",
      kauflandJv: "7777777777777",
      kauflandXl: "8888888888888",
      hoodJv: "9999999999999",
      hoodXl: "1231231231231"
    },
    "7777",
    "0000000000000"
  );

  const kaufland = rows.find((row) => row.market === "KAUFLAND");
  assert.ok(kaufland);
  assert.equal(kaufland.hasMatch, true);
  assert.equal(kaufland.cells[0].matches, true);
  assert.equal(kaufland.cells[1].matches, false);

  const ebay = rows.find((row) => row.market === "EBAY");
  assert.ok(ebay);
  assert.equal(ebay.hasMatch, false);
});

test("marketplace matrix model ignores placeholder values", () => {
  const rows = buildMarketplaceMatrixRows(
    {
      jv: "0000000000000",
      xl: "0000000000000",
      ottoJv: "0000000000000",
      ottoXl: "0000000000000",
      ebayJv: "1234567890123",
      ebayXl: "0000000000000",
      kauflandJv: "0000000000000",
      kauflandXl: "0000000000000",
      hoodJv: "0000000000000",
      hoodXl: "0000000000000"
    },
    "0000",
    "0000000000000"
  );

  assert.equal(rows.some((row) => row.hasMatch), false);
});

test("B-Ware masks OTTO EANs without changing the source values", () => {
  const rows = buildMarketplaceMatrixRows(
    {
      jv: "1111111111111",
      xl: "2222222222222",
      ottoJv: "3333333333333",
      ottoXl: "4444444444444",
      ebayJv: "5555555555555",
      ebayXl: "6666666666666",
      kauflandJv: "7777777777777",
      kauflandXl: "8888888888888",
      hoodJv: "9999999999999",
      hoodXl: "1231231231231"
    },
    "",
    "0000000000000",
    true,
  );

  const otto = rows.find((row) => row.market === "OTTO");
  assert.ok(otto);
  assert.equal(otto.cells[0].isBWare, true);
  assert.equal(otto.cells[1].isBWare, true);
  assert.equal(otto.cells[0].value, "B_WARE");
  assert.equal(otto.cells[1].value, "B_WARE");
});
