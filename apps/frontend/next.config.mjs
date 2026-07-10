import { withSentryConfig } from "@sentry/nextjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadMonorepoEnv() {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(dirname, "..");
  const candidates = [
    path.resolve(repoRoot, ".env"),
    path.resolve(repoRoot, "infra", ".env"),
    path.resolve(dirname, ".env.local"),
    path.resolve(dirname, ".env")
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const lines = fs.readFileSync(candidate, "utf8").split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const sep = line.indexOf("=");
      if (sep <= 0) continue;
      const key = line.slice(0, sep).trim();
      let value = line.slice(sep + 1).trim();
      if (!key || process.env[key]) continue;
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadMonorepoEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) so the runtime image
  // ships only the traced production deps instead of the whole node_modules tree.
  // Next standalone tracing can emit `node:*` chunk filenames that Windows cannot
  // copy into `.next/standalone`, while Linux CI/stage handles them correctly.
  output: process.platform === "win32" ? undefined : "standalone",
  // Keep the trailing slash so it reaches the rewrite intact. Otherwise Next 308-redirects
  // `/api/v1/services/...rows/` to the slashless form before rewriting, the proxied request
  // hits the Django backend without a trailing slash, and APPEND_SLASH 301s to a Location that
  // drops the `/services` proxy prefix — landing on the wrong backend with a 404.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8932";
    const servicesOrigin = process.env.SERVICES_ORIGIN ?? "http://localhost:8934";
    return [
      {
        // Append the trailing slash: Next strips it from `:path*`, and the Django services
        // backend (APPEND_SLASH=True) would otherwise 301 to a Location without the `/services`
        // proxy prefix, landing the request on the wrong backend. All services routes are
        // slash-terminated, so forcing the slash here is safe.
        source: "/api/v1/services/:path*",
        destination: `${servicesOrigin}/api/v1/:path*/`
      },
      {
        source: "/api/v1/:path((?!services(?:/|$)|orchestrator(?:/|$)|jv(?:/|$)|xl(?:/|$)|hood(?:/|$)|uploads(?:/|$)|docs(?:/|$)|backend(?:/|$)).*)",
        destination: `${backendOrigin}/api/v1/:path`
      }
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8932", pathname: "/uploads/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "8932", pathname: "/uploads/**" }
    ]
  }
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true
});
