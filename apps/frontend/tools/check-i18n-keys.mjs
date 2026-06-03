import { readFile } from "node:fs/promises";
import path from "node:path";

const I18N_FILE = path.resolve(process.cwd(), "app/i18n.ts");

function findLangBlock(source, lang) {
  const anchor = `${lang}: {`;
  const start = source.indexOf(anchor);
  if (start < 0) {
    return null;
  }
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

function extractKeys(block) {
  const matches = block.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm);
  const keys = [];
  for (const match of matches) {
    keys.push(match[1]);
  }
  return keys;
}

function reportDiff(baseLang, targetLang, baseSet, targetSet) {
  const missing = [...baseSet].filter((key) => !targetSet.has(key)).sort();
  const extra = [...targetSet].filter((key) => !baseSet.has(key)).sort();
  if (missing.length === 0 && extra.length === 0) {
    console.log(`[i18n] ${targetLang} matches ${baseLang} (${baseSet.size} keys)`);
    return true;
  }
  console.error(`[i18n] ${targetLang} does not match ${baseLang}`);
  if (missing.length > 0) {
    console.error(`  missing keys (${missing.length}): ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    console.error(`  extra keys (${extra.length}): ${extra.join(", ")}`);
  }
  return false;
}

async function main() {
  const source = await readFile(I18N_FILE, "utf8");
  const langs = ["en", "ru", "de"];
  const blocks = Object.fromEntries(
    langs.map((lang) => [lang, findLangBlock(source, lang)])
  );

  for (const lang of langs) {
    if (!blocks[lang]) {
      throw new Error(`[i18n] Failed to parse "${lang}" block in app/i18n.ts`);
    }
  }

  const keysByLang = Object.fromEntries(
    langs.map((lang) => [lang, extractKeys(blocks[lang])])
  );
  const sets = Object.fromEntries(
    langs.map((lang) => [lang, new Set(keysByLang[lang])])
  );

  let ok = true;
  ok = reportDiff("en", "ru", sets.en, sets.ru) && ok;
  ok = reportDiff("en", "de", sets.en, sets.de) && ok;

  if (!ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
