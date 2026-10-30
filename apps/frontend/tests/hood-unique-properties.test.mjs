import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/create-product/hood-product-properties-panel.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const compiled = ts.transpileModule(tree.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(tree)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function mount(properties) {
  const slots = [];
  const changes = [];
  let cursor = 0;
  const context = {
    exports: {}, require: createRequire(import.meta.url), Input: "input", DeferredInput: "deferred-input",
    useLabels: () => ({ duplicateProductProperty: 'Property "{name}" already exists', propertyName: "Name" }),
    useRef: initial => slots[cursor++] ??= { current: initial },
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useEffect: () => {},
  };
  runInNewContext(compiled, context);
  const render = () => {
    cursor = 0;
    const element = context.exports.HoodProductPropertiesPanel({
      initialValue: JSON.stringify(properties), draftKey: "hood-jv", onDraftChange: value => changes.push(JSON.parse(value)),
    });
    const nodes = [];
    function visit(value) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object" && value.props) {
        nodes.push(value);
        visit(value.props.children);
      }
    }
    visit(element);
    return nodes;
  };
  return { render, changes };
}

test("selected Hood presets are disabled and cannot be added twice", () => {
  const panel = mount([{ name: " produktart ", value: "Sofa" }]);
  const nodes = panel.render();
  assert.equal(nodes.find(node => node.type === "option" && node.props.value === "Produktart").props.disabled, true);
  nodes.find(node => node.type === "select").props.onChange({ target: { value: "Produktart" } });
  assert.equal(panel.changes.length, 0);
  assert.ok(panel.render().some(node => node.props.role === "alert"));
});

test("custom property cannot be renamed to an existing property", () => {
  const panel = mount([{ name: "Produktart", value: "Sofa" }, { name: "Material", value: "Holz" }]);
  const nameInputs = panel.render().filter(node => node.type === "input");
  nameInputs[1].props.onChange({ currentTarget: { value: " PRODUKTART " } });
  assert.equal(panel.changes.length, 0);
  assert.equal(panel.render().filter(node => node.type === "input")[1].props.value, "Material");
});

test("deleting a property makes it available again", () => {
  const panel = mount([{ name: "Produktart", value: "Sofa" }]);
  panel.render().find(node => node.type === "button").props.onClick();
  assert.deepEqual(panel.changes.at(-1), []);
  const nodes = panel.render();
  assert.equal(nodes.find(node => node.type === "option" && node.props.value === "Produktart").props.disabled, false);
  nodes.find(node => node.type === "select").props.onChange({ target: { value: "Produktart" } });
  assert.deepEqual(panel.changes.at(-1), [{ name: "Produktart", value: "" }]);
});
