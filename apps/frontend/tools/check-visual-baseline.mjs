import { access } from "node:fs/promises";
import path from "node:path";

const requiredFiles = [
  "e2e/__screenshots__/visual-regression.spec.ts/inventory-page.png",
  "e2e/__screenshots__/visual-regression.spec.ts/sofort-list-page.png",
  "e2e/__screenshots__/visual-regression.spec.ts/marketplace-page.png"
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const missing = [];
  for (const relativePath of requiredFiles) {
    const fullPath = path.resolve(process.cwd(), relativePath);
    if (!(await exists(fullPath))) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    console.error("Visual baseline is incomplete. Missing files:");
    for (const file of missing) {
      console.error(`- ${file}`);
    }
    console.error("Run: E2E_VISUAL=1 npm run test:e2e:visual:update");
    process.exit(1);
  }

  console.log("Visual baseline files are present.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
