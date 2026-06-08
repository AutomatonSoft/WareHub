import test from "node:test";
import assert from "node:assert/strict";
import { parseSiteIdsInput } from "../app/create-product/site-ids-input-model.mjs";

test("parseSiteIdsInput trims, removes empty and duplicates", () => {
  const ids = parseSiteIdsInput("  hood-de\n\nkaufland-de\nhood-de\n");
  assert.deepEqual(ids, ["hood-de", "kaufland-de"]);
});
