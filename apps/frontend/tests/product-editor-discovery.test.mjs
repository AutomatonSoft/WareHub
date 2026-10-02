import test from "node:test";
import assert from "node:assert/strict";
import { buildJvAutoLoadKey, createProductEditorDiscoveryLoader } from "../components/product-editor/product-editor-discovery.ts";

test("JV and XL requests are not deduplicated across accounts", async () => {
  const accounts = [];
  const load = createProductEditorDiscoveryLoader(async (ean, group, account) => {
    accounts.push(account);
    return { ean, groups: [] };
  });
  await Promise.all([load("111", "OTTO", "jv"), load("111", "OTTO", "xl")]);
  assert.deepEqual(accounts, ["jv", "xl"]);
});

test("loading JV cannot mark the same EAN as already loaded in XL", () => {
  const loaded = new Set([buildJvAutoLoadKey("JV", "4062292011702", "HOOD_JV")]);
  assert.equal(loaded.has(buildJvAutoLoadKey("XL", "4062292011702", "HOOD_JV")), false);
  assert.notEqual(buildJvAutoLoadKey("XL", "4062292011702", "XLMOEBEL_DE"), buildJvAutoLoadKey("XL", "4062292011703", "XLMOEBEL_DE"));
});

test("background scan and active-tab discovery share only in-flight requests", async () => {
  let calls = 0;
  let finish;
  const load = createProductEditorDiscoveryLoader(() => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  });
  const scan = load("4062292011702", "XL");
  const draft = load(" 4062292011702 ", "XL");
  assert.equal(scan, draft);
  assert.equal(calls, 1);
  finish({ ean: "4062292011702" });
  await Promise.all([scan, draft]);
  const refresh = load("4062292011702", "XL");
  assert.equal(calls, 2);
  finish({ ean: "4062292011702" });
  await refresh;
});

test("different groups and EANs stay independent, failed discovery can be retried", async () => {
  const calls = [];
  const load = createProductEditorDiscoveryLoader(async (ean, group) => {
    calls.push([ean, group]);
    throw new Error("unavailable");
  });
  await Promise.allSettled([load("1", "JV"), load("1", "XL"), load("2", "XL")]);
  assert.equal(calls.length, 3);
  await assert.rejects(load("1", "XL"), /unavailable/);
  assert.equal(calls.length, 4);
});

test("XL discovery resolves while another marketplace is still pending", async () => {
  const resolvers = new Map();
  const load = createProductEditorDiscoveryLoader((ean, group) => new Promise((resolve) => {
    resolvers.set(group, resolve);
  }));
  let ebayFinished = false;
  const ebay = load("4062292011702", "EBAY").then(() => { ebayFinished = true; });
  const xl = load("4062292011702", "XL");
  resolvers.get("XL")({ ean: "4062292011702", groups: [{ id: "XL" }] });
  assert.equal((await xl).groups[0].id, "XL");
  assert.equal(ebayFinished, false);
  resolvers.get("EBAY")({ ean: "4062292011702" });
  await ebay;
});
