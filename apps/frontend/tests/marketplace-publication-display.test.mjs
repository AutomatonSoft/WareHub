import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { getPendingPublicationMarketplaces, publicationSubmissionMessage } from "../lib/marketplace-publication-display.mjs";
import { buildOrchestratorStatusToastMessage } from "../app/create-product/create-product-controller-model.mjs";

const pending = marketplace => ({ marketplace, status: "success", data: { publication_state: "pending" } });
const labels = { taskStatusesCompleted: "Completed", taskStatusesFailed: "Failed", taskStatusesInQueue: "Queued", taskStatusesInProgress: "In progress", taskStatusesTargets: "Targets", taskStatusesCreatedAt: "Created", taskStatusesOrchestrator: "Marketplace create and update" };
const source = readFileSync(new URL("../components/tasks/orchestrator-task-status-panel.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["isCompleted", "isFailed", "statusView", "taskOperationLabel", "PublicationSubmissionNotice", "sourceLabel", "formatTime", "QueueTaskCard", "HistoryTaskRow", "TaskArchive"];
const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(tree)).join("\n");
const code = ts.transpileModule(`${functions}\nexport { QueueTaskCard, HistoryTaskRow, TaskArchive };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const targetModelSource = readFileSync(new URL("../components/tasks/task-target-model.ts", import.meta.url), "utf8");
const targetModel = {};
runInNewContext(ts.transpileModule(targetModelSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports: targetModel });

function components(language = "en") {
  const exports = {};
  const icon = props => React.createElement("span", props);
  runInNewContext(code, {
    exports, require: createRequire(import.meta.url), useLanguage: () => language,
    getPendingPublicationMarketplaces, publicationSubmissionMessage,
    buildTaskTargetRows: targetModel.buildTaskTargetRows, taskOperationName: targetModel.taskOperationName, TaskTargetList: () => null,
    extractOttoJobs: () => [], OttoJobStatusButton: () => null, EbayImageValidationWarnings: () => null,
    Check: icon, Clock3: icon, LoaderCircle: icon, CircleAlert: icon,
  });
  return exports;
}

test("pending labels are marketplace-specific, deduplicated, and ignore failed results", () => {
  assert.deepEqual(getPendingPublicationMarketplaces([pending("kaufland"), pending("kaufland")]), ["Kaufland"]);
  assert.deepEqual(getPendingPublicationMarketplaces([pending("otto"), pending("kaufland"), pending("hood"), { ...pending("otto"), status: "failed" }]), ["OTTO", "Kaufland"]);
  assert.deepEqual(getPendingPublicationMarketplaces([{ ...pending("otto"), status: "failed" }]), []);
});

for (const language of ["en", "ru", "de"]) {
  test(`Kaufland pending toast is informational and never mentions OTTO (${language})`, () => {
    const toast = buildOrchestratorStatusToastMessage({ labels, status: "success", totalResults: 1, failedCount: 0, failureSummary: "", pendingPublicationMarketplaces: getPendingPublicationMarketplaces([pending("kaufland")]), language });
    assert.equal(toast.tone, "info");
    assert.match(toast.message, /Kaufland/);
    assert.doesNotMatch(toast.message, /OTTO/);
  });
}

for (const marketplace of ["otto", "kaufland"]) {
  test(`${marketplace} pending submission is not shown as Completed in either history view`, () => {
    const { HistoryTaskRow, TaskArchive } = components();
    const task = { job_id: "test", ean: "4071489368680", source: "orchestrator", operation: "publish", status: "completed", created_at_unix_ms: 0, updated_at_unix_ms: 0, result: { results: [pending(marketplace)] } };
    for (const markup of [renderToStaticMarkup(React.createElement(HistoryTaskRow, { task, labels })), renderToStaticMarkup(React.createElement(TaskArchive, { tasks: [task], labels }))]) {
      assert.match(markup, /Submitted for validation/);
      assert.match(markup, /publication not confirmed/);
      assert.doesNotMatch(markup, /Completed/);
      assert.match(markup, marketplace === "otto" ? /OTTO/ : /Kaufland/);
      if (marketplace === "kaufland") assert.doesNotMatch(markup, /OTTO/);
    }
  });
  test(`${marketplace} loading card names its target before any result is available`, () => {
    const { QueueTaskCard } = components();
    const task = { job_id: "test", request_id: "request", ean: "4071489368680", source: "orchestrator", operation: "publish", status: "running", marketplaces: [marketplace], created_at_unix_ms: 0 };
    const markup = renderToStaticMarkup(React.createElement(QueueTaskCard, { task, labels }));
    assert.match(markup, /In progress/);
    assert.match(markup, /animate-spin/);
    assert.match(markup, marketplace === "otto" ? /Create product · OTTO/ : /Create product · Kaufland/);
  });
}

test("ordinary completed and failed tasks keep their existing status labels", () => {
  const { HistoryTaskRow } = components();
  for (const status of ["completed", "failed"]) {
    const task = { job_id: "test", ean: "ean", source: "orchestrator", operation: "publish", status, result: { results: [] } };
    const markup = renderToStaticMarkup(React.createElement(HistoryTaskRow, { task, labels }));
    assert.match(markup, status === "completed" ? /Completed/ : /Failed/);
    assert.doesNotMatch(markup, /Submitted for validation/);
  }
});

test("mixed OTTO and Kaufland submissions name both marketplaces", () => {
  const names = getPendingPublicationMarketplaces([pending("otto"), pending("kaufland")]);
  assert.match(publicationSubmissionMessage(names, "ru"), /OTTO, Kaufland: отправлено на проверку/);
});

test("a completed orchestration with failed targets is visibly partial, not green success", () => {
  const { HistoryTaskRow } = components("ru");
  const task = { job_id: "mixed", ean: "ean", source: "orchestrator", operation: "publish", status: "completed", result: { results: [
    { target: "hood,account=jv", marketplace: "hood", status: "success" },
    { target: "hood,account=xl", marketplace: "hood", status: "failed" },
  ] } };
  const html = renderToStaticMarkup(React.createElement(HistoryTaskRow, { task, labels }));
  assert.match(html, /Частично выполнено/);
  assert.match(html, /Создание товара/);
  assert.doesNotMatch(html, /Обработка завершена/);
});
