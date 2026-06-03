import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "e2e", "__screenshots__");
const MAX_FILES = Number(process.env.VISUAL_BUDGET_MAX_FILES || 40);
const MAX_TOTAL_BYTES = Number(process.env.VISUAL_BUDGET_MAX_TOTAL_BYTES || 12 * 1024 * 1024);
const MAX_FILE_BYTES = Number(process.env.VISUAL_BUDGET_MAX_FILE_BYTES || 2 * 1024 * 1024);

function walkPngFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkPngFiles(full, acc);
      continue;
    }
    if (entry.isFile() && full.toLowerCase().endsWith(".png")) {
      acc.push(full);
    }
  }
  return acc;
}

function main() {
  const files = walkPngFiles(ROOT);
  const stats = files.map((file) => ({ file, size: fs.statSync(file).size }));
  const totalBytes = stats.reduce((sum, item) => sum + item.size, 0);
  const oversized = stats.filter((item) => item.size > MAX_FILE_BYTES);

  const summary = {
    files: files.length,
    totalBytes,
    maxFiles: MAX_FILES,
    maxTotalBytes: MAX_TOTAL_BYTES,
    maxFileBytes: MAX_FILE_BYTES,
    oversizedFiles: oversized.length,
  };

  console.log("visual snapshot budget:");
  console.log(JSON.stringify(summary, null, 2));

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const lines = [
      "### Visual Snapshot Budget",
      "",
      `- files: ${files.length}/${MAX_FILES}`,
      `- total_bytes: ${totalBytes}/${MAX_TOTAL_BYTES}`,
      `- max_file_bytes_limit: ${MAX_FILE_BYTES}`,
      `- oversized_files: ${oversized.length}`,
      "",
    ];
    fs.appendFileSync(summaryPath, lines.join("\n"));
  }

  if (files.length > MAX_FILES) {
    console.error(`Visual snapshot budget exceeded: files=${files.length}, limit=${MAX_FILES}`);
    process.exit(1);
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    console.error(`Visual snapshot budget exceeded: total_bytes=${totalBytes}, limit=${MAX_TOTAL_BYTES}`);
    process.exit(1);
  }
  if (oversized.length > 0) {
    console.error("Visual snapshot budget exceeded: oversized files:");
    for (const item of oversized) {
      console.error(`- ${path.relative(process.cwd(), item.file)} (${item.size} bytes)`);
    }
    process.exit(1);
  }

  console.log("visual snapshot budget check passed");
}

main();
