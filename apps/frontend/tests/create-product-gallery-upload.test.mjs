import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function extract(path, names, context = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const selected = [];
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) selected.push(node);
    else ts.forEachChild(node, visit);
  };
  visit(tree);
  const compiled = ts.transpileModule(selected.map(statement => statement.getText(tree).replace(/^export /, "")).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(`${compiled}\n({${names.join(",")}})`, context);
}

test("JV and XL writes use canonical slash-terminated URLs without redirecting their method or body", async () => {
  const requests = [];
  const api = extract("../components/xljv/xljv-api.ts", ["buildQuery", "xljvBasePath", "xljvSyncIdentifierSegment", "xljvUpdateIdentifierSegment", "parseJsonSafe", "xljvCreateAndPush", "xljvSyncByEan", "xljvUpdateByEan"], {
    apiFetch: async (url, options) => {
      requests.push({ url, ...options });
      return new Response("{}", { status: 200 });
    }, Response,
  });
  for (const [site, siteKey] of [["JV", "JV_DE"], ["XL", "XLMOEBEL_DE"], ["XL", "XLMOEBEL_CH"], ["XL", "XLMOEBEL_AT"]]) {
    const params = { site, siteKey, ean: "4067282464896", payload: { name: "Lamp" } };
    await api.xljvCreateAndPush(params);
    await api.xljvSyncByEan({ ...params, requestBody: params.payload });
    await api.xljvUpdateByEan(params);
    const writes = requests.slice(-3);
    assert.deepEqual(writes.map(request => request.method), ["POST", "POST", "PATCH"]);
    for (const request of writes) {
      const url = new URL(request.url, "https://warehub.example");
      assert.ok(url.pathname.endsWith("/"), request.url);
      assert.equal(url.searchParams.get("site_key"), siteKey);
      assert.deepEqual(JSON.parse(request.body), params.payload);
    }
  }
});

test("JV gallery merges source paths and public URLs without duplicate images", () => {
  const { buildSourceGalleryItems } = extract("../app/create-product/page.tsx", ["buildSourceGalleryItems"], {
    normalizeSourceImagePath: value => typeof value === "string" ? value.trim() : "",
    asTrimmedString: value => typeof value === "string" ? value.trim() : "",
    resolveDisplaySrc: value => value.startsWith("https://") ? value : `https://www.jvmoebel.de/${value}`,
  });
  const items = buildSourceGalleryItems({ image: "images/main.jpg", images: [{ image: "images/main.jpg" }, { image: "images/Other.jpg" }, { image: "images/other.jpg" }] }, ["https://www.jvmoebel.de/images/main.jpg", "https://www.jvmoebel.de/images/Other.jpg"], "JV_DE");
  assert.equal(items.length, 3);
  assert.equal(new Set(items.map(item => item.src)).size, 3);
});

test("multipart image upload preserves remote URLs alongside new files", async () => {
  let submitted;
  const { xljvUploadImages } = extract("../components/xljv/xljv-api.ts", ["xljvUploadImages"], {
    FormData,
    postFormDataWithFallback: async (paths, body) => { submitted = body; return {}; },
    postJsonWithFallback: async () => { throw new Error("Unexpected JSON upload"); },
  });
  await xljvUploadImages({ site: "XL", files: [new Blob(["photo"])], sourceUrls: [" https://photos.example/existing.jpg "] });
  assert.equal(submitted.getAll("images").length, 1);
  assert.deepEqual(JSON.parse(submitted.get("source_urls")), ["https://photos.example/existing.jpg"]);
});

test("XL publication uses the edited gallery and retains existing photos with local files", async () => {
  let uploaded;
  let payload;
  const files = [new Blob(["new photo"])];
  const { handleCreateProductForXlDefaultSite } = extract("../app/create-product/use-create-product-controller.ts", ["handleCreateProductForXlDefaultSite"], {
    ean: "4067282464896", price: "340", productName: "Lamp", imagesText: "https://photos.example/removed.jpg", imageFiles: [],
    validateCreateProductInput: () => ({ isValid: true }),
    normalizeCreateProductInput: input => ({ ...input, imageUrls: input.imagesText.split("\n").filter(Boolean) }),
    setSubmitting: () => {}, showToast: () => {},
    xljvUploadImages: async params => { uploaded = params; return { response: { ok: true }, payload: { uploaded_image_urls: ["images/kept.jpg", "images/new.jpg"] } }; },
    xljvCreateAndPush: async params => { payload = params.payload; return { response: { ok: true } }; },
  });
  await handleCreateProductForXlDefaultSite(undefined, files, {
    siteKeys: ["XLMOEBEL_DE"], categoriesBySite: { XLMOEBEL_DE: [{ category_id: 1, main_category: true }] }, manufacturerBySite: { XLMOEBEL_DE: 1 }, sourceCurrency: "EUR", imageUrls: ["https://photos.example/kept.jpg"],
  });
  assert.equal(uploaded.files, files);
  assert.deepEqual(Array.from(uploaded.sourceUrls), ["https://photos.example/kept.jpg"]);
  assert.equal(payload.image, "images/kept.jpg");
  assert.equal(payload.quantity, 1);
  assert.equal(payload.images[0].image, "images/new.jpg");
});
