import test from "node:test";
import assert from "node:assert/strict";
import { resolveMobileApkUrl } from "../app/mobile-apk-url.mjs";

test("stage env uses stage apk url", () => {
  const url = resolveMobileApkUrl("stage", "https://stage.example.com/stage.apk", "https://app.example.com/prod.apk", "");
  assert.equal(url, "https://stage.example.com/stage.apk");
});

test("production env uses prod apk url", () => {
  const url = resolveMobileApkUrl("production", "https://stage.example.com/stage.apk", "https://app.example.com/prod.apk", "");
  assert.equal(url, "https://app.example.com/prod.apk");
});

test("falls back to generic url when env-specific url is missing", () => {
  const url = resolveMobileApkUrl("prod", "", "", "https://cdn.example.com/default.apk");
  assert.equal(url, "https://cdn.example.com/default.apk");
});

test("stage env falls back to the stage APK endpoint", () => {
  const url = resolveMobileApkUrl("stage", "", "", "");
  assert.equal(url, "/warehubstage.apk");
});

test("production env falls back to the production APK endpoint", () => {
  const url = resolveMobileApkUrl("prod", "", "", "");
  assert.equal(url, "/warehub.apk");
});

test("ignores placeholder APK values", () => {
  const url = resolveMobileApkUrl("prod", "", "TODO_UNKNOWN", "");
  assert.equal(url, "/warehub.apk");
});
