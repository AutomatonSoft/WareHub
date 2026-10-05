import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/create-product/create-product-source-api.ts", import.meta.url), "utf8");
const tree = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = new Set(["JV_SITE_PUBLIC_BASE", "XL_SITE_PUBLIC_BASE", "toAbsoluteImageUrl", "asTrimmedString", "getImageUrl", "normalizeImageUrls"]);
const selected = tree.statements.filter(statement =>
  (ts.isFunctionDeclaration(statement) && names.has(statement.name?.text)) ||
  (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => names.has(declaration.name.getText(tree))))
);
const compiled = ts.transpileModule(selected.map(statement => statement.getText(tree)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const { toAbsoluteImageUrl, normalizeImageUrls } = runInNewContext(`${compiled}\n({toAbsoluteImageUrl, normalizeImageUrls})`);

test("XL source image paths resolve to their own storefront, never JV", () => {
  for (const country of ["DE", "CH", "AT"]) {
    for (const path of ["catalog/replaced/4067282464896_extra_image.jpg", "/catalog/replaced/4067282464896_extra_image.jpg", "image/catalog/replaced/4067282464896_extra_image.jpg", "/image/catalog/replaced/4067282464896_extra_image.jpg"]) {
      assert.equal(toAbsoluteImageUrl(path, `XLMOEBEL_${country}`), `https://www.xlmoebel.${country.toLowerCase()}/image/catalog/replaced/4067282464896_extra_image.jpg`);
    }
  }
});

test("absolute URLs and JV media paths remain unchanged", () => {
  for (const url of ["https://media.example/image.webp", "//media.example/image.jpg", "blob:test", "data:image/png;base64,test"]) {
    assert.equal(toAbsoluteImageUrl(url, "XLMOEBEL_DE"), url);
  }
  assert.equal(toAbsoluteImageUrl("cosmoshop/default/pix/main.jpg", "JV_CO_UK"), "https://www.jvfurniture.co.uk/cosmoshop/default/pix/main.jpg");
  assert.equal(toAbsoluteImageUrl("/cosmoshop/default/pix/main.jpg", "JV_DE"), "https://www.jvmoebel.de/cosmoshop/default/pix/main.jpg");
  assert.equal(toAbsoluteImageUrl(" ", "XLMOEBEL_DE"), "");
});

test("XL draft relay URLs match visible photos and deduplicate the gallery", () => {
  const paths = normalizeImageUrls({
    image: "catalog/replaced/4067282464896_extra_image.jpg",
    images: [{ image: "catalog/replaced/4067282464896_extra_image.jpg" }, { image: "catalog/replaced/4067282464896_extra_human.jpg" }],
  }, "XLMOEBEL_DE");
  assert.deepEqual(Array.from(paths), [
    "https://www.xlmoebel.de/image/catalog/replaced/4067282464896_extra_image.jpg",
    "https://www.xlmoebel.de/image/catalog/replaced/4067282464896_extra_human.jpg",
  ]);
});
