import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("iframe blur preserves the latest price and other draft edits without reloading the frame", () => {
  const path = "../app/create-product/editable-description-preview.tsx";
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "EditableDescriptionPreview");
  assert.ok(component);
  const refs = [];
  let cursor = 0;
  let effects = [];
  const listeners = {};
  const frameBody = {
    scrollHeight: 512,
    querySelectorAll: () => [],
    setAttribute: () => {},
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };
  const frame = {
    style: {},
    contentDocument: { body: frameBody, documentElement: {} },
    contentWindow: { setTimeout: () => {}, addEventListener: () => {} },
  };
  const context = {
    exports: {}, require: createRequire(import.meta.url), AbortController,
    useRef: initial => refs[cursor++] ??= { current: initial },
    useState: initial => [initial, () => {}],
    useEffect: effect => { effects.push(effect); },
    readHoodDescriptionPreviewDocumentHtml: () => "<p>Edited description</p>",
    HtmlFontFamilySelect: () => null,
  };
  runInNewContext(ts.transpileModule(component.getText(tree), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  let draft = { price: "340", title: "Source title", description: "Source description" };
  const render = () => {
    cursor = 0;
    effects = [];
    const snapshot = draft;
    const element = context.exports.EditableDescriptionPreview({
      title: "Description", srcDoc: "source", onSave: description => { draft = { ...snapshot, description }; },
    });
    effects.forEach(effect => effect());
    return element.props.children.find(child => child.type === "iframe");
  };
  const iframe = render();
  iframe.props.ref.current = frame;
  iframe.props.onLoad();
  draft = { ...draft, price: "499", title: "Edited title" };
  render();
  listeners.input();
  listeners.blur();
  assert.deepEqual(draft, { price: "499", title: "Edited title", description: "<p>Edited description</p>" });
});
