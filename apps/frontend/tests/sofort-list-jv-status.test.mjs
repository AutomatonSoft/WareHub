import test from "node:test";
import assert from "node:assert/strict";

import { resolveMarketplaceActive } from "../components/inventory/sofort-list/sofort-list-jv-status.mjs";

test("resolveMarketplaceActive returns true when any marketplace status is active", () => {
  const result = resolveMarketplaceActive(
    {
      ean_status: {
        jv: false,
        xl: false,
        hood_jv: true,
      },
    },
  );

  assert.equal(result, true);
});

test("resolveMarketplaceActive returns false when all marketplace statuses are inactive", () => {
  const result = resolveMarketplaceActive(
    {
      ean_status: {
        jv: false,
        xl: false,
        hood_jv: false,
        hood_xl: false,
        otto_jv: false,
      },
    },
  );

  assert.equal(result, false);
});

test("resolveMarketplaceActive returns null when no marketplace boolean statuses are available", () => {
  const result = resolveMarketplaceActive(
    {
      ean_status: { jv: "yes" },
    },
  );

  assert.equal(result, null);
});
