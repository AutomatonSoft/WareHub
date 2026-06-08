import { readFile } from "node:fs/promises";
import path from "node:path";
import openapiTS, { astToString } from "openapi-typescript";

const schemaFile = process.env.OPENAPI_SCHEMA_FILE || "openapi/unified-openapi.json";
const outputFile = process.env.OPENAPI_TYPES_FILE || "lib/api/generated/openapi-types.ts";

function withBanner(content) {
  return (
    "// AUTO-GENERATED FILE. DO NOT EDIT.\n" +
    `// Source: ${schemaFile}\n\n` +
    content
  );
}

async function main() {
  const schemaPath = path.resolve(process.cwd(), schemaFile);
  const outputPath = path.resolve(process.cwd(), outputFile);
  const actual = await readFile(outputPath, "utf8");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));

  const generatedAst = await openapiTS(schema, {
    enum: true,
    alphabetize: true
  });
  const expected = withBanner(astToString(generatedAst));

  if (actual !== expected) {
    console.error("OpenAPI types are out of sync with schema.");
    console.error("Run: npm run openapi:types");
    process.exit(1);
  }

  console.log("OpenAPI types are in sync.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
