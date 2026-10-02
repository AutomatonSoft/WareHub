import test from "node:test";
import assert from "node:assert/strict";
import { describeMarketplaceError, marketplaceFieldKey } from "../components/product-forms/marketplace-errors.mjs";

test("DRF fields retain all errors and have Russian explanations", () => {
  const failure = describeMarketplaceError({ status: 400, payload: { price: ["A valid number is required."], quantity: ["This field is required."] } }, "ru");
  assert.deepEqual(failure.issues.map((issue) => issue.field), ["price", "quantity"]);
  assert.match(failure.message, /Цена/);
  assert.match(failure.message, /корректное число/);
  assert.match(failure.message, /обязательное поле/);
});

test("frontend field errors use the same field keys", () => {
  const failure = describeMarketplaceError({ field_errors: { productName: "Required", delivery: "A valid integer is required." } });
  assert.deepEqual(failure.issues.map((issue) => issue.field), ["title", "delivery"]);
});

test("Pydantic field paths map to visible controls without exposing input", () => {
  const failure = describeMarketplaceError({ payload: { detail: [{ loc: ["body", "draft", "price"], msg: "Input should be a valid number", input: "private-value" }] } });
  assert.equal(failure.issues[0].field, "price");
  assert.doesNotMatch(failure.message, /private-value/);
});

test("completed orchestrator jobs expose nested eBay missing aspects", () => {
  const failure = describeMarketplaceError({ status: "completed", request_id: "req-test", result: { results: [{ status: "failed", target: "ebay,account=dep", error: { code: "upstream_4xx", message: "Marketplace adapter returned non-success status", details: { upstream_response: { detail: "Missing required aspects", details: { missing_aspects: ["Produktart", "Marke"] } } } } }] } }, "ru");
  assert.deepEqual(failure.issues.map((issue) => issue.field), ["aspects.Produktart", "aspects.Marke"]);
  assert.equal(failure.requestId, "req-test");
  assert.match(failure.message, /обязательный атрибут/);
  assert.doesNotMatch(failure.message, /non-success/);
});

test("eBay description and image failures identify the correct field", () => {
  const failure = describeMarketplaceError({ errors: [{ code: "25718", message: "Description invalid" }, { code: "25002", message: "Picture must be at least 500 pixels" }] });
  assert.deepEqual(failure.issues.map((issue) => issue.field), ["description", "images"]);
  assert.match(failure.message, /4000/);
  assert.match(failure.message, /500/);
});

test("generic eBay 25002 never invents an image error", () => {
  assert.equal(describeMarketplaceError({ errors: [{ code: "25002", message: "A business error occurred" }] }).issues[0].field, "");
  assert.equal(describeMarketplaceError({ errors: [{ code: "25718", message: "Input value invalid" }] }).issues[0].field, "");
});

test("transport failures do not mark product fields invalid", () => {
  const failure = describeMarketplaceError({ status: 502, payload: { code: "orchestrator_channel_transport_error", message: "Marketplace adapter returned non-success status" } }, "ru");
  assert.equal(failure.issues[0].field, "");
  assert.match(failure.message, /серверную ошибку/);
});

test("auth and rate limit errors are localized", () => {
  for (const [status, text] of [[401, /авторизация/], [403, /прав/], [429, /лимит/]]) {
    assert.match(describeMarketplaceError({ status, payload: { detail: "technical reason" } }, "ru").message, text);
  }
});

test("a success target does not create an error", () => {
  const failure = describeMarketplaceError({ targets: [{ status: "success", data: { price: ["1"] } }, { status: "failed", error: { details: { upstream_response: { errors: { width: ["A valid number is required."] } } } } }] });
  assert.deepEqual(failure.issues.map((issue) => issue.field), ["width"]);
});

test("JSON upstream bodies retain their field errors", () => {
  const failure = describeMarketplaceError({ error: { details: { upstream_response: { body: JSON.stringify({ errors: { ean: ["This field is required."] } }) } } } });
  assert.equal(failure.issues[0].field, "ean");
});

test("unknown paths are not guessed and error volume is bounded", () => {
  assert.equal(marketplaceFieldKey("body.internal_seller_setting"), "");
  const failure = describeMarketplaceError({ errors: Array.from({ length: 500 }, (_, index) => ({ field: "price", message: `Failure ${index}` })) });
  assert.equal(failure.issues.length, 50);
});
