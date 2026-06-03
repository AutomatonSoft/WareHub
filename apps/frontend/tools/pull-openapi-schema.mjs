import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SCHEMA_URL = "http://localhost:8931/api/docs/openapi";
const schemaUrl = process.env.OPENAPI_SCHEMA_URL || DEFAULT_SCHEMA_URL;
const outputPath = process.env.OPENAPI_SCHEMA_FILE || "openapi/unified-openapi.json";

async function main() {
  const response = await fetch(schemaUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI schema: HTTP ${response.status} (${schemaUrl})`);
  }

  const json = await response.json();
  const absoluteOutputPath = path.resolve(process.cwd(), outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, JSON.stringify(json, null, 2), "utf8");
  console.log(`OpenAPI schema saved to ${absoluteOutputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
