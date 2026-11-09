import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describeMarketplaceError } from "../components/product-forms/marketplace-errors.mjs";

const require = createRequire(import.meta.url);
function compile(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, require: name => dependencies[name] ?? require(name) });
  return exports;
}
const model = compile("../components/tasks/task-target-model.ts");
const { TaskTargetList } = compile("../components/tasks/task-target-list.tsx", {
  "./task-target-model": model,
  "../../app/use-labels": { useLanguage: () => "ru" },
  "../product-forms/marketplace-errors.mjs": { describeMarketplaceError },
});
const plain = value => JSON.parse(JSON.stringify(value));

test("each account and country has its own readable destination", () => {
  const cases = [
    ["otto,profile=jv", "otto", "OTTO JV"], ["otto,profile=xl", "otto", "OTTO XL"],
    ["kaufland,account=jv", "kaufland", "Kaufland JV"], ["hood,account=xl", "hood", "HOOD XL"],
    ["ebay,account=dep", "ebay", "eBay DEP"], ["xljv,site=JV,site_key=JV_DE", "xljv", "JV DE"],
    ["JV_CO_UK", "JV", "JV UK"], ["xljv,site_key=XLMOEBEL_AT", "xljv", "XL AT"],
    ["HOOD_JV", "HOOD", "HOOD JV"],
  ];
  for (const [target, marketplace, expected] of cases) assert.equal(model.taskTargetLabel({ target, marketplace }), expected);
});

test("queued destinations are preserved and completed results replace their placeholder rows", () => {
  const targets = ["kaufland,account=jv", "kaufland,account=xl", "otto,profile=jv"];
  const queued = model.buildTaskTargetRows([], targets, "queued");
  assert.deepEqual(plain(queued.map(row => row.state)), ["queued", "queued", "queued"]);
  const results = [
    { target: targets[0], marketplace: "kaufland", status: "success", data: { publication_state: "pending" } },
    { target: targets[1], marketplace: "kaufland", status: "failed", error: { message: "Missing image" } },
    { target: targets[2], marketplace: "otto", status: "success", data: { publication_state: "pending" } },
  ];
  const rows = model.buildTaskTargetRows(results, targets, "completed");
  assert.equal(rows.length, 3);
  assert.deepEqual(plain(rows.map(row => row.state)), ["submitted", "failed", "submitted"]);
});

test("per-site EAN is taken from the actual mapping and is not invented from the source EAN", () => {
  const rows = model.buildTaskTargetRows([
    { target: "otto,profile=jv", status: "success", data: { marketplace_ean_mapping: { mapping: { mapping: { ean: "4071489368680" } } } } },
    { target: "otto,profile=xl", status: "success", data: { ean: "4071489368673" } },
    { target: "hood,account=jv", status: "success" },
  ]);
  assert.deepEqual(plain(rows.map(row => row.ean)), ["4071489368680", "4071489368673", ""]);
});

test("real target component displays separate destinations, outcomes, EAN and error", () => {
  const results = [
    { target: "kaufland,account=jv", marketplace: "kaufland", status: "success", data: { ean: "4071489368680", publication_state: "pending" } },
    { target: "otto,profile=xl", marketplace: "otto", status: "failed", error: { message: "Invalid Grundfarbe" } },
    { target: "JV_DE", marketplace: "JV", status: "applied" },
  ];
  const html = renderToStaticMarkup(React.createElement(TaskTargetList, { results, status: "completed", operation: "publish" }));
  assert.equal((html.match(/<li /g) ?? []).length, 3);
  for (const text of ["Kaufland JV", "OTTO XL", "JV DE", "Отправлено на проверку", "Ошибка", "Invalid Grundfarbe", "4071489368680", "Отправлено"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /Опубликован/);
});

test("unfinished targets do not become successful because their parent job completed", () => {
  const rows = model.buildTaskTargetRows([], ["hood,account=xl"], "completed");
  assert.equal(rows[0].state, "unknown");
  assert.equal(model.targetStateLabel("unknown", "ru", "publish"), "Результат неизвестен");
  assert.equal(model.buildTaskTargetRows([{ target: "JV_DE", status: "skipped" }])[0].state, "skipped");
  const running = model.buildTaskTargetRows([], ["hood,account=xl", "otto,profile=jv"], "running");
  assert.ok(running.every(row => row.state === "processing"));
  assert.equal(model.targetStateLabel(running[0].state, "ru", "publish"), "Ожидает результата");
});

test("all three Task statuses views include per-target results", () => {
  const panel = readFileSync(new URL("../components/tasks/orchestrator-task-status-panel.tsx", import.meta.url), "utf8");
  assert.equal((panel.match(/<TaskTargetList /g) ?? []).length, 3);
  assert.equal(model.taskOperationName("publish", "ru"), "Создание товара");
  assert.equal(model.taskOperationName("product_editor_hood", "ru"), "Обновление товара");
});
