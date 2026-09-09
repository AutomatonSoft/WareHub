import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const I18N_FILE = path.resolve(process.cwd(), "app/i18n.ts");
const LANGS = ["en", "ru", "de"];

function findLangBlock(source, lang) {
  const anchor = `${lang}: {`;
  const start = source.indexOf(anchor);
  if (start < 0) return null;
  let i = start + anchor.length;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  return source.slice(start + anchor.length, i - 1);
}

function extractEntries(block) {
  const entries = [];
  const regex = /^\s*([A-Za-z0-9_]+)\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?/gm;
  for (const match of block.matchAll(regex)) {
    entries.push({ key: match[1], value: match[2] });
  }
  return entries;
}

function digest(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

test("i18n dictionaries: key parity and snapshot", async () => {
  const source = await readFile(I18N_FILE, "utf8");
  const byLang = new Map();

  for (const lang of LANGS) {
    const block = findLangBlock(source, lang);
    assert.ok(block, `Failed to parse language block "${lang}"`);
    const entries = extractEntries(block);
    assert.ok(entries.length > 0, `Language "${lang}" has no string entries`);
    byLang.set(lang, entries);
  }

  const enEntries = byLang.get("en");
  const enKeys = enEntries.map((entry) => entry.key);
  const enSet = new Set(enKeys);

  assert.equal(enSet.size, enKeys.length, "EN dictionary contains duplicate keys");
  assert.equal(enSet.size, 1991, "Unexpected EN key count: dictionary shape changed");

  for (const lang of ["ru", "de"]) {
    const entries = byLang.get(lang);
    const keys = entries.map((entry) => entry.key);
    const set = new Set(keys);
    assert.equal(set.size, keys.length, `${lang} dictionary contains duplicate keys`);
    assert.deepEqual([...set].sort(), [...enSet].sort(), `${lang} keys differ from en keys`);
  }

  const concatenated = LANGS.map((lang) =>
    byLang
      .get(lang)
      .map((entry) => `${entry.key}=${entry.value}`)
      .join("\n")
  ).join("\n---\n");

  const snapshot = digest(concatenated);
  assert.equal(
    snapshot,
    "694a59671acb665832e51fe827c528123e31b319135dd468b86c0bb0671771f6",
    "i18n dictionary snapshot changed; review and update expected hash intentionally"
  );
});

test("i18n dictionaries: no replacement character in values", async () => {
  const source = await readFile(I18N_FILE, "utf8");
  for (const lang of LANGS) {
    const block = findLangBlock(source, lang);
    assert.ok(block, `Failed to parse language block "${lang}"`);
    const entries = extractEntries(block);
    const bad = entries.filter((entry) => entry.value.includes("\uFFFD"));
    assert.equal(bad.length, 0, `${lang} contains invalid replacement chars in values`);
  }
});

test("i18n dictionaries: no mojibake marker pattern in de values", async () => {
  const source = await readFile(I18N_FILE, "utf8");
  const block = findLangBlock(source, "de");
  assert.ok(block, 'Failed to parse language block "de"');
  const entries = extractEntries(block);
  const mojibakeLike = entries.filter((entry) => /[A-Za-z]\?[A-Za-z]/.test(entry.value));
  assert.equal(
    mojibakeLike.length,
    0,
    `de contains mojibake-like values: ${mojibakeLike.map((item) => item.key).join(", ")}`
  );
});
