import { readFile } from "node:fs/promises";
import path from "node:path";
import openapiTS, { astToString } from "openapi-typescript";

const schemaFile = process.env.OPENAPI_SCHEMA_FILE || "openapi/unified-openapi.json";
const outputFile = process.env.OPENAPI_TYPES_FILE || "lib/api/generated/openapi-types.ts";

function sanitizeOperationIds(schema) {
  if (!schema || typeof schema !== "object" || !schema.paths || typeof schema.paths !== "object") {
    return schema;
  }

  const seen = new Set();
  const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

  for (const [pathKey, pathItem] of Object.entries(schema.paths)) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    const normalizedPathKey = pathKey.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object") {
        continue;
      }

      const rawOperationId =
        typeof operation.operationId === "string" && operation.operationId.trim()
          ? operation.operationId.trim()
          : `${method}_${normalizedPathKey}`;
      let candidate = rawOperationId;

      if (seen.has(candidate)) {
        candidate = `${method}_${normalizedPathKey}`;
      }

      let deduped = candidate;
      let suffix = 2;
      while (seen.has(deduped)) {
        deduped = `${candidate}_${suffix}`;
        suffix += 1;
      }

      operation.operationId = deduped;
      seen.add(deduped);
    }
  }

  return schema;
}

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
  const schema = sanitizeOperationIds(JSON.parse(await readFile(schemaPath, "utf8")));

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
