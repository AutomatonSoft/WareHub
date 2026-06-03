const frontendUrl = process.env.E2E_BASE_URL || "http://localhost:8931";
const backendHealthUrl = process.env.E2E_BACKEND_HEALTH_URL || "http://localhost:8932/healthz";
const runtimeLocale = Intl.DateTimeFormat().resolvedOptions().locale || "unknown";
const runtimeTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";

function fail(message) {
  console.error(`e2e preflight failed: ${message}`);
  process.exit(1);
}

async function checkHttpOk(url, label) {
  let response;
  try {
    response = await fetch(url, { method: "GET" });
  } catch (error) {
    fail(`${label} is unreachable: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    fail(`${label} returned HTTP ${response.status} for ${url}`);
  }
}

function printRuntimeInfo() {
  const info = {
    baseURL: frontendUrl,
    backendHealthURL: backendHealthUrl,
    locale: process.env.E2E_LOCALE || process.env.LC_ALL || process.env.LANG || runtimeLocale,
    timezone: process.env.TZ || runtimeTimeZone,
    nodeVersion: process.version,
  };
  console.log("e2e preflight context:");
  console.log(JSON.stringify(info, null, 2));
}

async function main() {
  if (!process.env.E2E_LOGIN || !process.env.E2E_PASSWORD) {
    fail("E2E_LOGIN/E2E_PASSWORD are required.");
  }

  printRuntimeInfo();
  await checkHttpOk(`${frontendUrl}/login`, "frontend login page");
  await checkHttpOk(backendHealthUrl, "backend health endpoint");

  console.log("e2e preflight passed");
}

await main();
