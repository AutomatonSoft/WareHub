import { withSentryConfig } from "@sentry/nextjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadMonorepoEnv() {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(dirname, "..");
  const candidates = [
    path.resolve(dirname, ".env.local"),
    path.resolve(dirname, ".env"),
    path.resolve(repoRoot, ".env"),
    path.resolve(repoRoot, "infra", ".env")
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
  async rewrites() {
    const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8932";
    const servicesOrigin = process.env.SERVICES_ORIGIN ?? "http://localhost:8934";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendOrigin}/api/v1/:path*`
      },
      {
        source: "/api/uploads/images/",
        destination: `${servicesOrigin}/api/uploads/images/`
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
