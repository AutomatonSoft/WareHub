import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../components/editor/ean-pool-api.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});

function loadClient(fetch) {
  const exports = {};
  runInNewContext(outputText, {
    exports, fetch, AbortController, window: { setTimeout, clearTimeout },
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
  });
  return exports;
}

test("EAN claims distinguish two warehouse rows with the same KID number", async () => {
  const assignments = new Map([[31, "4071489361285"], [41, "4071489369823"]]);
  const { claimEanForKid } = loadClient(async (url, init) => {
    assert.equal(url, "/api/v1/services/ean-pool/claim-for-job/");
    assert.equal(init.method, "POST");
    const payload = JSON.parse(init.body);
    assert.equal(payload.kid_number, "408501031");
    assert.equal(payload.reservation_family, "jv");
    assert.ok(assignments.has(payload.kid_id));
    return Response.json({ ean: assignments.get(payload.kid_id) });
  });
  for (const [kidId, expected] of assignments) {
    const result = await claimEanForKid({ kidId, kidNumber: "408501031", reservationFamily: "jv" });
    assert.equal(result.ean, expected);
  }
});

test("EAN claim displays the server message without a JSON wrapper", async () => {
  const detail = "Multiple Kid records match kid_number; specify kid_id.";
  const { claimEanForKid } = loadClient(async () => Response.json({ detail }, { status: 409 }));
  const result = await claimEanForKid({ kidId: 41, kidNumber: "408501031", reservationFamily: "xl" });
  assert.equal(result.response.status, 409);
  assert.equal(result.ean, null);
  assert.equal(result.errorText, detail);
});
