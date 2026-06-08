const DEFAULT_SERVICES_API_BASE = "http://localhost:8934/api/v1";
const DOCKER_SERVICES_API_BASE = "http://services:8000/api/v1";
const DEFAULT_BACKEND_API_BASE = "http://localhost:8932";
const DOCKER_BACKEND_API_BASE = "http://backend:8932";
const DEFAULT_ORCHESTRATOR_API_BASE = "http://localhost:8935";
const DOCKER_ORCHESTRATOR_API_BASE = "http://orchestrator:8011";

type JsonObject = Record<string, unknown>;

type OpenApiDocument = {
  openapi?: string;
  info?: JsonObject;
  servers?: Array<{ url: string; description?: string }>;
  paths?: Record<string, JsonObject>;
  components?: Record<string, JsonObject>;
  tags?: Array<{ name: string; description?: string }>;
  "x-tagGroups"?: Array<{ name: string; tags: string[] }>;
};

const OPENAPI_CACHE_TTL_MS = 30_000;
export const runtime = "nodejs";

const SERVICES_OPENAPI_TIMEOUT_MS = 12_000;
const BACKEND_OPENAPI_TIMEOUT_MS = 3_000;
const ORCHESTRATOR_OPENAPI_TIMEOUT_MS = 7_000;

let openApiCache: { value: OpenApiDocument; expiresAt: number } | null = null;

function normalizeBase(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

function resolveServicesBaseCandidates(): string[] {
  const candidates = [
    normalizeBase(process.env.SERVICES_API_BASE_URL),
    normalizeBase(process.env.NEXT_PUBLIC_SERVICES_API_BASE_URL),
    normalizeBase(process.env.NEXT_PUBLIC_API_BASE_URL),
    DOCKER_SERVICES_API_BASE,
    DEFAULT_SERVICES_API_BASE
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates));
}

function normalizeBackendBase(value: string | undefined): string | null {
  const normalized = normalizeBase(value);
  if (!normalized) {
    return null;
  }
  return normalized.replace(/\/api\/v1$/i, "");
}

function resolveBackendBaseCandidates(): string[] {
  const candidates = [
    normalizeBackendBase(process.env.BACKEND_API_BASE_URL),
    normalizeBackendBase(process.env.NEXT_PUBLIC_API_BASE_URL),
    DOCKER_BACKEND_API_BASE,
    DEFAULT_BACKEND_API_BASE
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates));
}

function resolveOrchestratorBaseCandidates(): string[] {
  const candidates = [
    normalizeBackendBase(process.env.ORCHESTRATOR_API_BASE_URL),
    normalizeBackendBase(process.env.NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL),
    DOCKER_ORCHESTRATOR_API_BASE,
    DEFAULT_ORCHESTRATOR_API_BASE
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates));
}

function resolveAdditionalOpenApiSources(): Array<{ source: string; candidates: string[] }> {
  const raw = process.env.OPENAPI_EXTRA_SOURCES?.trim();
  if (!raw) return [];
  const entries = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const results: Array<{ source: string; candidates: string[] }> = [];

  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0) continue;
    const source = entry.slice(0, separator).trim();
    const base = normalizeBackendBase(entry.slice(separator + 1));
    if (!source || !base) continue;
    results.push({ source, candidates: [base] });
  }
  return results;
}

async function fetchJson(url: string, timeoutMs: number): Promise<OpenApiDocument | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as OpenApiDocument;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function folderTagForPath(repoName: string, path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return `${repoName}/root`;

  // Canonical v1 route shape: /api/v1/<domain>/...
  if (segments[0] === "api" && segments[1] === "v1") {
    if (segments[2] === "orchestrator") {
      const orchestratorDomain = segments[3] ?? "root";
      return `${repoName}/orchestrator-${orchestratorDomain}`;
    }
    return `${repoName}/${segments[2] ?? "root"}`;
  }

  // Legacy/non-v1 namespaces still used in services.
  if (segments[0] === "api") {
    const legacyDomain = segments[1] ?? "root";
    if (legacyDomain === "xl" || legacyDomain === "jv") {
      const resource = segments[2] ?? "root";
      return `${repoName}/${legacyDomain}-${resource}`;
    }
    if (legacyDomain === "hood" || legacyDomain === "kaufland" || legacyDomain === "afterbuy") {
      return `${repoName}/${legacyDomain}`;
    }
    return `${repoName}/${legacyDomain}`;
  }

  return `${repoName}/${segments[0]}`;
}

function addRepoTagsToPaths(repoName: string, paths: Record<string, JsonObject>): {
  paths: Record<string, JsonObject>;
  tags: Array<{ name: string; description?: string }>;
} {
  const httpMethods = ["get", "post", "put", "patch", "delete", "options", "head"];
  const nextPaths: Record<string, JsonObject> = {};
  const tagsMap = new Map<string, { name: string; description?: string }>();

  for (const [path, pathItem] of Object.entries(paths)) {
    const folderTag = folderTagForPath(repoName, path);
    tagsMap.set(folderTag, {
      name: folderTag,
      description: `Endpoints from ${repoName} grouped by ${folderTag.split("/")[1]}`
    });

    const nextPathItem: JsonObject = { ...pathItem };
    for (const method of httpMethods) {
      const rawOperation = nextPathItem[method];
      if (!rawOperation || typeof rawOperation !== "object") {
        continue;
      }
      const operation = rawOperation as JsonObject;
      const existingTags = Array.isArray(operation.tags) ? (operation.tags as string[]) : [];
      operation.tags = [folderTag, ...existingTags.filter((tag) => tag !== folderTag)];
      operation["x-repository"] = repoName;
      nextPathItem[method] = operation;
    }
    nextPaths[path] = nextPathItem;
  }

  return {
    paths: nextPaths,
    tags: Array.from(tagsMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  };
}

function mergeComponentSection(target: JsonObject, incoming: JsonObject, sourcePrefix: string): JsonObject {
  const merged: JsonObject = { ...target };
  for (const [key, value] of Object.entries(incoming)) {
    if (!(key in merged)) {
      merged[key] = value;
      continue;
    }
    const prefixedKey = `${sourcePrefix}_${key}`;
    merged[prefixedKey] = value;
  }
  return merged;
}

function mergeSchemas(docs: Array<{ source: string; doc: OpenApiDocument }>): OpenApiDocument {
  const mergedPaths: Record<string, JsonObject> = {};
  const mergedComponents: Record<string, JsonObject> = {};
  const mergedTags: Array<{ name: string; description?: string }> = [];

  for (const { source, doc } of docs) {
    const sourcePaths = doc.paths ?? {};
    const withTags = addRepoTagsToPaths(source, sourcePaths);

    for (const [path, pathItem] of Object.entries(withTags.paths)) {
      if (!(path in mergedPaths)) {
        mergedPaths[path] = pathItem;
        continue;
      }
      const existingPathItem = mergedPaths[path];
      mergedPaths[path] = { ...existingPathItem, ...pathItem };
    }

    mergedTags.push(...withTags.tags);

    const sourceComponents = doc.components ?? {};
    for (const [sectionName, sectionValue] of Object.entries(sourceComponents)) {
      if (!sectionValue || typeof sectionValue !== "object") {
        continue;
      }
      const existingSection = mergedComponents[sectionName];
      const targetSection = existingSection && typeof existingSection === "object" ? (existingSection as JsonObject) : {};
      mergedComponents[sectionName] = mergeComponentSection(targetSection, sectionValue as JsonObject, source);
    }
  }

  const sortedPaths = Object.fromEntries(
    Object.entries(mergedPaths).sort(([a], [b]) => {
      const folderA = folderTagForPath("api", a);
      const folderB = folderTagForPath("api", b);
      if (folderA !== folderB) {
        return folderA.localeCompare(folderB);
      }
      return a.localeCompare(b);
    })
  );
  const uniqueTags = Array.from(new Map(mergedTags.map((tag) => [tag.name, tag])).values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const groupedTagsMap = new Map<string, string[]>();
  for (const tag of uniqueTags) {
    const [repo, folder] = tag.name.split("/", 2);
    const groupName = repo || "other";
    const groupTag = folder ? `${groupName}/${folder}` : tag.name;
    const current = groupedTagsMap.get(groupName) ?? [];
    current.push(groupTag);
    groupedTagsMap.set(groupName, current);
  }
  const tagGroups = Array.from(groupedTagsMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, tags]) => ({
      name,
      tags: Array.from(new Set(tags)).sort((a, b) => a.localeCompare(b))
    }));

  return {
    openapi: "3.1.0",
    info: {
      title: "WareHub Unified API",
      version: "v1",
      description: "Combined OpenAPI schema from backend and services repositories."
    },
    paths: sortedPaths,
    components: mergedComponents,
    tags: uniqueTags,
    "x-tagGroups": tagGroups
  };
}

async function fetchFirstOpenApiDocument(baseCandidates: string[], timeoutMs: number): Promise<OpenApiDocument | null> {
  const urls: string[] = [];
  for (const base of baseCandidates) {
    const suffixes = /\/api\/v1$/i.test(base) ? ["/openapi.json"] : ["/openapi.json", "/api/v1/openapi.json"];
    for (const suffix of suffixes) {
      urls.push(`${base}${suffix}`);
    }
  }

  const uniqueUrls = Array.from(new Set(urls));
  const attempts = uniqueUrls.map(async (url) => {
    const doc = await fetchJson(url, timeoutMs);
    if (!doc) {
      throw new Error(`Failed: ${url}`);
    }
    return doc;
  });
  try {
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}

function resolveDocsOrigin(request: Request): string | null {
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const docsOrigin = resolveDocsOrigin(request);
  if (openApiCache && openApiCache.expiresAt > Date.now()) {
    const cachedValue = docsOrigin
      ? { ...openApiCache.value, servers: [{ url: docsOrigin, description: "Local docs origin" }] }
      : openApiCache.value;
    return new Response(JSON.stringify(cachedValue), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.oai.openapi+json; charset=utf-8",
        "Cache-Control": "public, max-age=15"
      }
    });
  }

  const servicesBaseCandidates = resolveServicesBaseCandidates();
  const backendBaseCandidates = resolveBackendBaseCandidates();
  const orchestratorBaseCandidates = resolveOrchestratorBaseCandidates();
  const extraSources = resolveAdditionalOpenApiSources();

  const sourceSpecs: Array<{ source: string; candidates: string[]; timeoutMs: number }> = [
    { source: "backend", candidates: backendBaseCandidates, timeoutMs: BACKEND_OPENAPI_TIMEOUT_MS },
    { source: "services", candidates: servicesBaseCandidates, timeoutMs: SERVICES_OPENAPI_TIMEOUT_MS },
    { source: "orchestrator", candidates: orchestratorBaseCandidates, timeoutMs: ORCHESTRATOR_OPENAPI_TIMEOUT_MS },
    ...extraSources.map((item) => ({ source: item.source, candidates: item.candidates, timeoutMs: SERVICES_OPENAPI_TIMEOUT_MS }))
  ];

  const docs = (
    await Promise.all(
      sourceSpecs.map(async (spec) => {
        const doc = await fetchFirstOpenApiDocument(spec.candidates, spec.timeoutMs);
        return doc ? { source: spec.source, doc } : null;
      })
    )
  ).filter((item): item is { source: string; doc: OpenApiDocument } => Boolean(item));

  if (docs.length === 0) {
    return new Response(
      JSON.stringify({
        detail: "OpenAPI schema proxy request failed",
        backend_candidates: backendBaseCandidates,
        services_candidates: servicesBaseCandidates,
        orchestrator_candidates: orchestratorBaseCandidates
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  }

  const merged = mergeSchemas(docs);
  if (docsOrigin) {
    merged.servers = [{ url: docsOrigin, description: "Local docs origin" }];
  }
  openApiCache = {
    value: merged,
    expiresAt: Date.now() + OPENAPI_CACHE_TTL_MS
  };

  return new Response(JSON.stringify(merged), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.oai.openapi+json; charset=utf-8",
      "Cache-Control": "public, max-age=15"
    }
  });
}
