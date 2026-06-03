import { spawn } from "node:child_process";

const env = {
  ...process.env,
  OPENAPI_SCHEMA_FILE: "openapi/orchestrator-openapi.json",
  OPENAPI_TYPES_FILE: "lib/api/generated/orchestrator-openapi-types.ts"
};

const child = spawn(process.execPath, ["tools/check-openapi-drift.mjs"], {
  stdio: "inherit",
  env
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
