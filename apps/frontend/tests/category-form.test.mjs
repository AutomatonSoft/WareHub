import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMainCategoryChange,
  buildCategoryPayload
} from "../app/dashboard/category-form-logic.mjs";

test("form payload without category keeps nulls", () => {
  const payload = buildCategoryPayload("", "");
  assert.equal(payload.category_main, null);
  assert.equal(payload.category_sub, null);
});

test("selecting main only sets main and keeps sub null", () => {
  const payload = buildCategoryPayload("Wohnzimmer", "");
  assert.equal(payload.category_main, "Wohnzimmer");
  assert.equal(payload.category_sub, null);
});

test("selecting main and sub sets both values", () => {
  const payload = buildCategoryPayload("Küche", "Küchenschränke");
  assert.equal(payload.category_main, "Küche");
  assert.equal(payload.category_sub, "Küchenschränke");
});

test("changing main category resets subcategory", () => {
  const next = applyMainCategoryChange("Badezimmer");
  assert.equal(next.categoryMain, "Badezimmer");
  assert.equal(next.categorySub, null);
});
