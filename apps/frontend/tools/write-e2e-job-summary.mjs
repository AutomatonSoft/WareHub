import fs from "node:fs";

function main() {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    console.log("GITHUB_STEP_SUMMARY is not set, skip e2e summary.");
    return;
  }

  const suite = process.env.E2E_SUMMARY_SUITE || "unknown";
  const command = process.env.E2E_SUMMARY_COMMAND || "n/a";
  const artifact = process.env.E2E_SUMMARY_ARTIFACT || "n/a";
  const status = process.env.E2E_SUMMARY_STATUS || "unknown";
  const notes = process.env.E2E_SUMMARY_NOTES || "";

  const lines = [
    `### E2E Suite: ${suite}`,
    "",
    `- status: ${status}`,
    `- command: \`${command}\``,
    `- artifact: \`${artifact}\``,
  ];
  if (notes.trim().length > 0) {
    lines.push(`- notes: ${notes}`);
  }
  lines.push("");

  fs.appendFileSync(summaryPath, lines.join("\n"));
}

main();
