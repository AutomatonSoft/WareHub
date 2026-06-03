import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import openapiTS, { astToString } from "openapi-typescript";

const schemaFile = process.env.OPENAPI_SCHEMA_FILE || "openapi/unified-openapi.json";
const outputFile = process.env.OPENAPI_TYPES_FILE || "lib/api/generated/openapi-types.ts";

async function main() {
  const schemaPath = path.resolve(process.cwd(), schemaFile);
  const outputPath = path.resolve(process.cwd(), outputFile);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));

  const outputAst = await openapiTS(schema, {
    enum: true,
    alphabetize: true
  });
  const output = astToString(outputAst);

  const banner =
    "// AUTO-GENERATED FILE. DO NOT EDIT.\n" +
    `// Source: ${schemaFile}\n\n`;
  const content = banner + output;
  await writeFile(outputPath, content, "utf8");
  console.log(`OpenAPI types generated at ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
