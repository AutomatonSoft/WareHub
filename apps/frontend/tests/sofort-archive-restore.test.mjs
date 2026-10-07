import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function selectSource(path, predicate) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let selected;
  const visit = node => {
    if (predicate(node, tree)) selected = node;
    else ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(selected);
  return selected.getText(tree);
}

test("archive return dialog shows old place and requires a positive new place without activating marketplaces", () => {
  const source = selectSource("../components/inventory/sofort-list/sofort-list-table-shell.tsx", (node, tree) => ts.isJsxElement(node) && node.openingElement.getText(tree).startsWith("<Dialog open={Boolean(marketplaceConfirm)}"));
  let confirm;
  let restore;
  const context = {
    require, exports: {}, React,
    props: { archived: true, labels: { confirmActionDetails: "Review", confirmActionCurrentPlace: "Previous place", confirmActionNewPlace: "New place" } },
    t: { restoreToSofort: "Return to Sofort list", archiveRestoreHint: "Marketplaces remain inactive.", restorePositivePlaceRequired: "Enter a positive place.", kid: "KID", ean: "EAN" },
    marketplaceConfirm: { row: { kidNumber: "123", place: "-35" }, inactive: false, nextPlace: "", placeError: null },
    deactivatingRowId: null, hasQuantityDeactivationWarning: false,
    setMarketplaceConfirm: update => { context.marketplaceConfirm = typeof update === "function" ? update(context.marketplaceConfirm) : update; },
    runArchiveRestore: (row, place) => { restore = { row, place }; },
    runMarketplaceAction: () => { throw new Error("Must not activate marketplaces"); },
    cn: (...values) => values.filter(value => typeof value === "string").join(" "),
  };
  for (const name of ["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogFooter", "Badge", "AlertTriangle", "CheckCircle2", "Clock3"]) {
    context[name] = ({ children }) => React.createElement("div", null, children);
  }
  context.Input = function Input(props) { return React.createElement("input", props); };
  context.Button = function Button(props) {
    if (props.children === context.t.restoreToSofort) confirm = props.onClick;
    return React.createElement("button", props);
  };
  const compiled = ts.transpileModule(`exports.render = () => (${source});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(compiled, context);
  const markup = renderToStaticMarkup(React.createElement(context.exports.render));
  assert.match(markup, /Previous place.*-35/);
  assert.match(markup, /Marketplaces remain inactive/);
  assert.match(markup, /required=""/);
  for (const invalid of ["", "0", "-12", "abc"]) {
    context.marketplaceConfirm.nextPlace = invalid;
    confirm();
    assert.equal(context.marketplaceConfirm.placeError, context.t.restorePositivePlaceRequired);
    assert.equal(restore, undefined);
  }
  context.marketplaceConfirm.nextPlace = " 12 ";
  confirm();
  assert.equal(restore.place, "12");
});

test("archive restore request includes the chosen place", async () => {
  const source = selectSource("../components/inventory/inventory-api.ts", node => ts.isFunctionDeclaration(node) && node.name?.text === "restoreArchivedKid");
  let body;
  const context = {
    exports: {}, getServicesApiBase: () => "/api/v1",
    apiFetch: async (_url, options) => { body = JSON.parse(options.body); return { ok: true }; },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  await context.exports.restoreArchivedKid("123", 7, "12");
  assert.deepEqual(body, { kid_number: "123", kid_id: 7, archived: false, place: "12" });
});
