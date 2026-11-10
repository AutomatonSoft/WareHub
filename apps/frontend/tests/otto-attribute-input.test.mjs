import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { getOttoAttributeChoices, normalizeOttoAttributeValues } from "../app/create-product/otto-create-product-model.mjs";

function extractFunctions(path, names) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return tree.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map((node) => node.getText(tree)).join("\n");
}

const inputCode = ts.transpileModule(extractFunctions("../app/create-product/otto-create-product-panel.tsx", ["AttributeInput"]), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;

function renderInput(props) {
  return runInNewContext(`${inputCode}\nAttributeInput(props);`, {
    props, getOttoAttributeChoices, normalizeOttoAttributeValues, Input: "input",
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    useEffect: (effect) => effect(),
  });
}

test("actual OTTO gender input is a single select and normalizes Neutral", () => {
  const changes = [];
  const input = renderInput({ name: "Geschlecht", value: "Neutral", onChange: (value) => changes.push(value) });
  assert.equal(input.type, "select");
  assert.equal(input.props.multiple, false);
  assert.equal(input.props.value, "neutral");
  assert.deepEqual(changes, ["neutral"]);
});

test("actual OTTO audience input selects separate category values and allows clearing", () => {
  const changes = [];
  const input = renderInput({ name: "Zielgruppe", value: "Erwachsene/Jugendliche", allowedValues: ["Erwachsene", "Jugendliche"], onChange: (value) => changes.push(value) });
  assert.equal(input.props.multiple, true);
  assert.deepEqual(Array.from(input.props.value), ["Erwachsene", "Jugendliche"]);
  assert.equal(input.props["aria-invalid"], false);
  input.props.onChange({ target: { selectedOptions: [{ value: "Erwachsene" }, { value: "Jugendliche" }] } });
  input.props.onChange({ target: { selectedOptions: [] } });
  assert.deepEqual(changes, ["Erwachsene, Jugendliche", "Erwachsene, Jugendliche", ""]);
});

test("actual OTTO inputs preserve invalid source values visibly instead of guessing a replacement", () => {
  const changes = [];
  const input = renderInput({ name: "Geschlecht", value: "Unisex", allowedValues: ["neutral"], onChange: (value) => changes.push(value) });
  assert.equal(input.props["aria-invalid"], true);
  assert.equal(input.props.value, "Unisex");
  assert.deepEqual(changes, []);
});

test("actual Product Editor mapper sends audience values separately and gender lowercase", () => {
  const code = extractFunctions("../components/product-editor/product-editor-otto-panel.tsx", ["textValue", "attributeId", "attributeValues", "toEditorAttributes"]);
  const attributes = runInNewContext(ts.transpileModule(`${code}\ntoEditorAttributes(source, draft);`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    normalizeOttoAttributeValues,
    source: [{ attributeId: "gender", name: "Geschlecht", values: ["Neutral"] }],
    draft: { removedAttributeIds: [], attributeOverrides: { gender: "Neutral" }, additionalAttributes: { audience: "Erwachsene/Jugendliche" }, attributeNames: { audience: "Zielgruppe" } },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(attributes)).map(({ name, values }) => ({ name, values })), [
    { name: "Geschlecht", values: ["neutral"] },
    { name: "Zielgruppe", values: ["Erwachsene", "Jugendliche"] },
  ]);
});
