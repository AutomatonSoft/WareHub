import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require: name => dependencies[name] ?? require(name) });
  return exports;
}
const model = compile("../components/inventory/sofort-list/sofort-list-marketplace-matrix-model.ts");
const { SofortListMarketplaceMatrix } = compile("../components/inventory/sofort-list/sofort-list-marketplace-matrix.tsx", {
  "./sofort-list-marketplace-matrix-model": model,
  "@/components/ui/checkbox": { Checkbox: props => React.createElement("input", { type: "checkbox", className: props.className, checked: props.checked, readOnly: true, "aria-label": props["aria-label"] }) },
});
const keys = ["jv", "xl", "ottoJv", "ottoXl", "ebayJv", "ebayXl", "ebayDep", "kauflandJv", "kauflandXl", "hoodJv", "hoodXl", "temu"];
const props = {
  siteEans: Object.fromEntries(keys.map(key => [key, "4067282464896"])),
  siteEanStatuses: Object.fromEntries(keys.map(key => [key, key === "ebayDep"])),
  bWare: false, query: "", placeholderEan: "0000000000000", highlightText: value => value,
  labels: { matrixAria: "Marketplace EAN", jv: "JV", xl: "XL", matched: "matched", value: "value", empty: "empty" },
};
const markup = renderToStaticMarkup(React.createElement(SofortListMarketplaceMatrix, props));
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("real marketplace component renders DEP header and exactly one DEP value, belonging only to eBay", () => {
  assert.match(markup, /<span>JV<\/span><span>XL<\/span><span>DEP<\/span>/);
  assert.equal((markup.match(/aria-label="EBAY ebayDep status"/g) ?? []).length, 1);
  const rows = model.buildMarketplaceMatrixRows(props.siteEans, props.siteEanStatuses, "", props.placeholderEan, false);
  assert.deepEqual(Array.from(rows.find(row => row.market === "EBAY").cells, cell => cell.key), ["ebayJv", "ebayXl", "ebayDep"]);
  assert.ok(rows.filter(row => row.market !== "EBAY").every(row => row.cells.length <= 2));
  assert.equal(rows.find(row => row.market === "EBAY").cells[2].status, true);
});

test("all responsive matrix grids reserve three account columns and TEMU spans only JV/XL", () => {
  const grids = [...css.matchAll(/\.wh-sofort-marketplace-matrix__head,\s*\.wh-sofort-marketplace-matrix__row\s*\{([^}]+)\}/g)];
  assert.equal(grids.length, 3);
  assert.ok(grids.every(match => /repeat\(3, minmax\(0, 1fr\)\)/.test(match[1])));
  assert.match(css, /\.wh-sofort-marketplace-matrix__value--single\s*\{\s*grid-column: 2 \/ span 2;/);
  const shell = readFileSync(new URL("../components/inventory/sofort-list/sofort-list-table-shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /wh-sofort-table-wrap[^"\n]*overflow-x-auto/);
});

if (process.env.DEP_LAYOUT_PREVIEW_PATH) {
  const cards = [526, 534, 340].map(width => `<section style="width:${width}px"><h2>Available width: ${width}px</h2>${markup}</section>`).join("");
  writeFileSync(process.env.DEP_LAYOUT_PREVIEW_PATH, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a}main{display:flex;gap:24px;flex-wrap:wrap}section{padding:12px;background:white;border:1px solid #e2e8f0;border-radius:12px}h1{font-size:20px}h2{font-size:14px}.wh-sofort-marketplace-matrix__checkbox{width:16px;height:16px}</style></head><body><h1>Sofort list: JV / XL / DEP — local component preview</h1><main>${cards}</main></body></html>`);
}
