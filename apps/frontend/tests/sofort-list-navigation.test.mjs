import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../components/inventory/sofort-list/sofort-list-navigation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
runInNewContext(compiled, { exports, URLSearchParams });
const { buildSofortCreateProductHref, getSofortListReturnHref } = exports;

test("Create Product round trip preserves page four, page size and filters", () => {
  const returnTo = "/sofort-list?page=4&page_size=50&q=Sofa+%26+Bett&section=G&archived=true";
  const href = buildSofortCreateProductHref(1614, returnTo);
  const params = new URL(href, "https://warehub.test").searchParams;
  assert.equal(params.get("kid"), "1614");
  assert.equal(getSofortListReturnHref(params.get("returnTo")), returnTo);
});

test("direct Create Product entry returns to the first Sofort list page", () => {
  assert.equal(getSofortListReturnHref(null), "/sofort-list");
  assert.equal(getSofortListReturnHref("/sofort-list"), "/sofort-list");
});

test("return navigation rejects external URLs and other routes", () => {
  for (const value of ["https://other.test/sofort-list", "//other.test", "javascript:alert(1)", "/sofort-list/123", "/sofort-list-other", "/sofort-list\\other"]) {
    assert.equal(getSofortListReturnHref(value), "/sofort-list");
  }
});

test("list entry and return button use the navigation helpers", () => {
  const shell = readFileSync(new URL("../components/inventory/sofort-list/sofort-list-table-shell.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/create-product/page.tsx", import.meta.url), "utf8");
  assert.match(shell, /router\.push\(buildSofortCreateProductHref\(row\.kidId, `\$\{window\.location\.pathname\}\$\{window\.location\.search\}`\)\)/);
  assert.match(page, /getSofortListReturnHref\(searchParams\.get\("returnTo"\)\)/);
  assert.match(page, /<Link href=\{sofortListReturnHref\}/);
});
