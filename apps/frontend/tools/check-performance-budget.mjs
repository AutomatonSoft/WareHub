import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const nextStaticChunksDir = path.join(projectRoot, ".next", "static", "chunks");

const budgets = {
  maxTotalChunksKb: Number(process.env.PERF_BUDGET_TOTAL_KB || 2000),
  maxLargestChunkKb: Number(process.env.PERF_BUDGET_LARGEST_KB || 430)
};

function toKb(bytes) {
  return bytes / 1024;
}

function formatKb(bytes) {
  return `${toKb(bytes).toFixed(1)} KB`;
}

function collectJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

if (!fs.existsSync(nextStaticChunksDir)) {
  console.error(`Budget check failed: "${nextStaticChunksDir}" not found. Run "npm run build" first.`);
  process.exit(1);
}

const jsFiles = collectJsFiles(nextStaticChunksDir);
if (jsFiles.length === 0) {
  console.error("Budget check failed: no JS chunks found.");
  process.exit(1);
}

const sizes = jsFiles.map((filePath) => {
  const stat = fs.statSync(filePath);
  return { filePath, bytes: stat.size };
});

const totalBytes = sizes.reduce((sum, item) => sum + item.bytes, 0);
const largest = sizes.reduce((max, item) => (item.bytes > max.bytes ? item : max), sizes[0]);

const topFive = [...sizes]
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 5)
  .map((item) => `${path.relative(projectRoot, item.filePath)}: ${formatKb(item.bytes)}`);

console.log("Performance budget report:");
console.log(`- JS chunks total: ${formatKb(totalBytes)} (budget: ${budgets.maxTotalChunksKb} KB)`);
console.log(`- Largest JS chunk: ${formatKb(largest.bytes)} (budget: ${budgets.maxLargestChunkKb} KB)`);
console.log("- Top 5 largest chunks:");
for (const row of topFive) {
  console.log(`  - ${row}`);
}

const totalExceeded = toKb(totalBytes) > budgets.maxTotalChunksKb;
const largestExceeded = toKb(largest.bytes) > budgets.maxLargestChunkKb;

if (totalExceeded || largestExceeded) {
  console.error("Performance budget check failed.");
  process.exit(1);
}

console.log("Performance budget check passed.");
