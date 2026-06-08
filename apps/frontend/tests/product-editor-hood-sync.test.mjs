import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHoodDraftFromApiItem,
  buildHoodPatchPayloadFromDraft,
  mergeHoodImageUrls,
  reorderHoodImages,
  removeHoodImage,
  setHoodMainImage
} from "../components/product-editor/product-editor-hood-sync.mjs";
import {
  makeHoodDescriptionPreviewEditableDocument,
  readHoodDescriptionPreviewDocumentHtml
} from "../components/product-editor/product-editor-hood-description-preview.mjs";

test("product editor hood sync builds draft from by-ean payload item", () => {
  const draft = buildHoodDraftFromApiItem({
    account: "jv",
    ean: "4012345678901",
    targetId: "HOOD_JV",
    rawPayload: { items: [] },
    item: {
      ean: "4012345678901",
      item_id: "123",
      title: "Lamp",
      image: "https://img/1.jpg",
      images: ["https://img/1.jpg", "https://img/2.jpg"],
      productProperties: [{ name: "Color", value: "Gold" }]
    }
  });

  assert.equal(draft?.target_id, "HOOD_JV");
  assert.equal(draft?.account, "jv");
  assert.deepEqual(draft?.images, ["https://img/1.jpg", "https://img/2.jpg"]);
  assert.deepEqual(draft?.productProperties, [{ name: "Color", value: "Gold" }]);
});

test("product editor hood sync builds patch payload only for changed fields", () => {
  const result = buildHoodPatchPayloadFromDraft(
    {
      target_id: "HOOD_XL",
      account: "xl",
      ean: "4012345678901",
      item_id: "123",
      title: "Lamp",
      description: "<p>Desk</p>",
      price: "99.99",
      quantity: "2",
      categoryID: "2412",
      condition: "new",
      itemMode: "auction",
      itemNumber: "A-1",
      image: "https://img/1.jpg",
      images: ["https://img/1.jpg", "https://img/2.jpg"],
      productProperties: [{ name: "Color", value: "Gold" }],
      raw_payload: {},
      pending_uploads: []
    },
    ["price", "images", "productProperties"]
  );

  assert.deepEqual(result.changedKeys, ["price", "images", "productProperties"]);
  assert.deepEqual(result.payloadObject, {
    price: "99.99",
    images: ["https://img/1.jpg", "https://img/2.jpg"],
    productProperties: [{ name: "Color", value: "Gold" }]
  });
});

test("product editor hood sync merges uploaded urls by role", () => {
  assert.deepEqual(
    mergeHoodImageUrls(["https://img/1.jpg"], ["https://img/2.jpg"], "additional"),
    ["https://img/1.jpg", "https://img/2.jpg"]
  );
  assert.deepEqual(
    mergeHoodImageUrls(["https://img/1.jpg"], ["https://img/2.jpg"], "main"),
    ["https://img/2.jpg", "https://img/1.jpg"]
  );
});

test("product editor hood sync moves selected image to main position", () => {
  assert.deepEqual(
    setHoodMainImage(["https://img/1.jpg", "https://img/2.jpg", "https://img/3.jpg"], "https://img/3.jpg"),
    ["https://img/3.jpg", "https://img/1.jpg", "https://img/2.jpg"]
  );
});

test("product editor hood sync reorders images so first position becomes main", () => {
  assert.deepEqual(
    reorderHoodImages(
      ["https://img/1.jpg", "https://img/2.jpg", "https://img/3.jpg"],
      "https://img/3.jpg",
      "https://img/1.jpg"
    ),
    ["https://img/3.jpg", "https://img/1.jpg", "https://img/2.jpg"]
  );
});

test("product editor hood sync removes image and keeps only remaining urls", () => {
  assert.deepEqual(
    removeHoodImage(["https://img/1.jpg", "https://img/2.jpg"], "https://img/1.jpg"),
    ["https://img/2.jpg"]
  );
});

test("product editor hood description preview makes body editable", () => {
  const documentHtml = makeHoodDescriptionPreviewEditableDocument("<html><body><p>Desk</p></body></html>");
  assert.match(documentHtml, /contenteditable="true"/i);
  assert.match(documentHtml, /data-hood-preview-editable="true"/i);
});

test("product editor hood description preview serializes document html", () => {
  assert.equal(
    readHoodDescriptionPreviewDocumentHtml({ outerHTML: "<html><body><p>Desk</p></body></html>" }),
    "<html><body><p>Desk</p></body></html>"
  );
  assert.equal(readHoodDescriptionPreviewDocumentHtml(null), "");
});
