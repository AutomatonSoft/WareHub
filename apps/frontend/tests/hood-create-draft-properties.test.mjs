import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/create-product/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submitBlock;
function visit(node) {
  if (ts.isIfStatement(node) && node.expression.getText(tree) === 'site.family === "HOOD"') submitBlock = node;
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(submitBlock);
const compiled = ts.transpileModule(`async function submit() { ${submitBlock.getText(tree)} } submit();`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

for (const account of ["jv", "xl"]) {
  for (const properties of [[{ name: "Produktart", value: "Sofa" }], []]) {
    test(`HOOD ${account} submits the latest properties after deleting ${properties.length ? "a duplicate" : "all rows"}`, async () => {
      const tab = `hood_${account}`;
      const duplicate = JSON.stringify([{ name: "Produktart", value: "Sofa" }, { name: "Produktart", value: "Holz" }]);
      const latest = JSON.stringify(properties);
      const draft = { name: "Edited sofa", ean: "4071489363630", price: "299.99", description: "Edited description", productPropertiesText: duplicate };
      const calls = [];
      const tasks = [];
      const snapshot = { sourceKey: `context:HOOD_${account.toUpperCase()}`, draft: { ...draft, name: "Old title", productPropertiesText: latest } };
      const context = {
        site: { family: "HOOD", kind: account.toUpperCase(), id: `hood-${account}`, name: "HOOD" },
        tab, activeTab: tab, activeDraftContextKey: "context", activeHoodDraftKey: "draft", activeReservedMarketplaceEan: "reserved",
        hoodDraftRefByTab: { current: { [tab]: snapshot } },
        hoodPublishDraftRef: { current: { draftKey: "draft:reserved", draft } },
        activeHoodInitialDraft: draft, tabGalleryItemsByTab: {}, tasks,
        requireDraft: Boolean, getLocalImageFilesForTab: () => [],
        controller: { handleCreateProductForHoodSiteIds: (...args) => calls.push(args) },
      };
      await runInNewContext(compiled, context);
      assert.equal(tasks.length, 1);
      await tasks[0]();
      assert.equal(calls[0][1].fields.productPropertiesText, latest);
      assert.equal(calls[0][1].name, "Edited sofa");
      assert.equal(calls[0][1].price, "299.99");
      assert.equal(calls[0][1].fields.description, "Edited description");
    });
  }
}
