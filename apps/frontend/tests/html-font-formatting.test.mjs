import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function compile(source, context, expression) {
  const output = ts.transpileModule(source.replace(/^export /gm, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${output}\n${expression}`, context);
}

const sizeSource = readFileSync(new URL("../components/ui/html-font-style.ts", import.meta.url), "utf8");
const applySize = compile(sizeSource, {}, "applyHtmlFontSize");

test("font size applies pixels only to newly formatted text, preserving existing large fonts", () => {
  const oldFont = { replaceWith() { assert.fail("Existing formatting must not be replaced"); } };
  const text = { textContent: "Selected text" };
  let replacement;
  let spanChildren;
  let applied = false;
  const font = { childNodes: [text], replaceWith(node) { replacement = node; } };
  const document = {
    body: { querySelectorAll: () => applied ? [oldFont, font] : [oldFont] },
    execCommand: (...args) => { assert.deepEqual(args, ["fontSize", false, "7"]); applied = true; },
    createElement: tag => {
      assert.equal(tag, "span");
      return { style: {}, replaceChildren: (...children) => { spanChildren = children; } };
    },
  };
  applySize(document, "24");
  assert.equal(replacement.style.fontSize, "24px");
  assert.deepEqual(spanChildren, [text]);
});

test("invalid font sizes cannot change the document", () => {
  const document = { body: {}, execCommand: () => assert.fail("Invalid size must be ignored") };
  for (const value of ["", "7", "97", "24.5", "large", "16px"]) applySize(document, value);
});

for (const path of [
  "../app/create-product/editable-description-preview.tsx",
  "../components/product-editor/product-editor-hood-panel.tsx",
]) {
  test(`${path}: size and color restore iframe selection and save HTML`, () => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let formatting;
    function visit(node) {
      if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(tree) === "applyFormatting") formatting = node;
      ts.forEachChild(node, visit);
    }
    visit(tree);
    assert.ok(formatting);
    const commands = [];
    const saved = [];
    const range = { selected: "Product description" };
    const selection = { removeAllRanges: () => {}, addRange: actual => assert.equal(actual, range) };
    const document = { execCommand: (...args) => commands.push(args) };
    const context = {
      iframeRef: { current: { contentDocument: document, contentWindow: { getSelection: () => selection } } },
      selectionRangeRef: { current: range }, saveSelection: () => {},
      applyHtmlFontSize: (actual, size) => { assert.equal(actual, document); commands.push(["pixels", size]); },
      saveFrameEdits: () => saved.push(true), syncFrameToDraft: () => saved.push(true), syncFrameHeight: () => {},
    };
    const text = (ts.isVariableDeclaration(formatting) ? "const " : "") + formatting.getText(tree);
    const apply = compile(text, context, "applyFormatting");
    apply("fontSize", "20");
    apply("foreColor", "#ff0000");
    assert.deepEqual(commands, [["pixels", "20"], ["foreColor", false, "#ff0000"]]);
    assert.equal(saved.length, 2);
    context.selectionRangeRef.current = null;
    apply("foreColor", "#00ff00");
    assert.equal(saved.length, 2);
  });
}

test("all HTML editor implementations expose size and color controls", () => {
  for (const path of [
    "../app/create-product/jv-description-editor.tsx",
    "../app/create-product/editable-description-preview.tsx",
    "../components/product-editor/product-editor-hood-panel.tsx",
    "../components/xljv/xljv-create-form.tsx",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /<HtmlFontStyleControls[^>]*onSizeChange=/);
    assert.match(source, /onColorChange=/);
    assert.match(source, /applyHtmlFontSize/);
  }
});

test("XL/JV form restores selection and saves formatting without overwriting other fields", () => {
  const path = "../components/xljv/xljv-create-form.tsx";
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let command;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "applyHtmlCommand") command = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(command);
  let form = { price: "299", title: "Edited product", description_html: "Before" };
  const editor = { focus: () => {}, innerHTML: "<span>After</span>" };
  const range = {};
  const calls = [];
  const apply = compile(command.getText(tree), {
    htmlEditorRef: { current: editor }, selectionRangeRef: { current: range },
    document: {
      getSelection: () => ({ removeAllRanges: () => {}, addRange: actual => assert.equal(actual, range) }),
      execCommand: (...args) => calls.push(args),
    },
    saveHtmlSelection: () => {}, applyHtmlFontSize: (_document, value) => calls.push(["pixels", value]),
    onSetCreateForm: update => { form = update(form); },
  }, "applyHtmlCommand");
  apply("fontSize", "24");
  apply("foreColor", "#ff0000");
  assert.deepEqual(calls, [["pixels", "24"], ["foreColor", false, "#ff0000"]]);
  assert.deepEqual(JSON.parse(JSON.stringify(form)), { price: "299", title: "Edited product", description_html: "<span>After</span>" });
});
