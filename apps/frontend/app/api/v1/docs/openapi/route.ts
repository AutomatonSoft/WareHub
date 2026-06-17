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
const SOURCE_ORDER = ["backend", "services", "orchestrator"] as const;

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

function titleCaseLabel(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").trim();
  const knownLabels: Record<string, string> = {
    admin: "Admin",
    afterbuy: "Afterbuy",
    auth: "Auth",
    "ean pool": "EAN Pool",
    healthz: "System",
    hood: "Hood",
    inventory: "Inventory",
    intakes: "Intakes",
    jobs: "Jobs",
    jv: "JV",
    kaufland: "Kaufland",
    kids: "Kids",
    "label layout": "Label Layout",
    logs: "Logs",
    marketplace: "Marketplace",
    meta: "System",
    metrics: "System",
    mobile: "Mobile",
    "openapi.json": "System",
    orders: "Orders",
    otto: "Otto",
    "printer setup": "Printer Setup",
    "product editor": "Product Editor",
    products: "Products",
    readyz: "System",
    reconciliation: "Reconciliation",
    scalar: "System",
    session: "Session",
    system: "System",
    uploads: "Uploads",
    xl: "XL"
  };
  const exactMatch = knownLabels[normalized.toLowerCase()];
  if (exactMatch) {
    return exactMatch;
  }

  return value
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function displayRepoName(repoName: string): string {
  if (repoName === "backend") return "Backend";
  if (repoName === "services") return "Services";
  if (repoName === "orchestrator") return "Orchestrator";
  return titleCaseLabel(repoName);
}

function getSourceSortIndex(repoName: string): number {
  const index = SOURCE_ORDER.indexOf(repoName as (typeof SOURCE_ORDER)[number]);
  return index === -1 ? SOURCE_ORDER.length : index;
}

function getDomainSortIndex(repoName: string, domain: string): number {
  const normalizedDomainKey = domain.trim().toLowerCase().replace(/\s+/g, "-");
  const domainOrders: Record<string, string[]> = {
    backend: [
      "system",
      "mobile",
      "logs",
      "auth",
      "admin",
      "intakes",
      "kids",
      "label-layout",
      "printer-setup",
      "uploads",
      "afterbuy"
    ],
    services: [
      "system",
      "session",
      "kids",
      "orders",
      "inventory",
      "ean-pool",
      "uploads",
      "afterbuy",
      "kaufland",
      "marketplace",
      "hood",
      "otto",
      "xl",
      "jv"
    ],
    orchestrator: [
      "system",
      "jobs",
      "product-editor",
      "products",
      "reconciliation"
    ]
  };

  const order = domainOrders[repoName] ?? [];
  const index = order.indexOf(normalizedDomainKey);
  return index === -1 ? order.length : index;
}

function normalizeDomain(repoName: string, domain: string): string {
  const normalized = domain.trim().toLowerCase();
  if (["healthz", "readyz", "meta", "openapi.json", "scalar", "metrics"].includes(normalized)) {
    return "system";
  }
  if (repoName === "services" && normalized === "dev") {
    return "session";
  }
  return normalized;
}

function getPathDomain(repoName: string, path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "root";

  if (segments[0] === "api" && segments[1] === "v1") {
    if (segments[2] === "orchestrator") {
      return normalizeDomain(repoName, segments[3] ?? "root");
    }
    if (repoName === "services" && segments[2] === "services") {
      return normalizeDomain(repoName, segments[3] ?? "root");
    }
    return normalizeDomain(repoName, segments[2] ?? "root");
  }

  if (segments[0] === "api") {
    return normalizeDomain(repoName, segments[1] ?? "root");
  }

  return normalizeDomain(repoName, segments[0]);
}

function folderTagForPath(repoName: string, path: string): string {
  const domain = getPathDomain(repoName, path);
  return `${displayRepoName(repoName)} / ${titleCaseLabel(domain)}`;
}

function defaultResponseDescription(statusCode: string): string {
  const descriptions: Record<string, string> = {
    "200": "Request completed successfully.",
    "201": "Resource created successfully.",
    "202": "Request accepted for processing.",
    "204": "Request completed successfully with no response body.",
    "400": "Request validation failed.",
    "401": "Authentication is required or provided credentials are invalid.",
    "403": "Authenticated user is not allowed to perform this action.",
    "404": "Requested resource was not found.",
    "409": "Request conflicts with current resource state.",
    "422": "Request body or parameters failed schema validation.",
    "500": "Internal server error.",
    "502": "Upstream dependency request failed.",
    "503": "Service is temporarily unavailable."
  };
  return descriptions[statusCode] ?? "Request response.";
}

function buildFallbackSummary(method: string, path: string): string {
  const segments = path
    .split("/")
    .filter(Boolean)
    .filter((segment) => !["api", "v1", "services", "orchestrator"].includes(segment))
    .filter((segment) => !/^\{.+\}$/.test(segment));
  const lastSegment = segments[segments.length - 1] ?? "resource";
  const parentSegment = segments[segments.length - 2] ?? lastSegment;
  const lastLabel = titleCaseLabel(lastSegment);
  const parentLabel = titleCaseLabel(parentSegment);

  if (method === "get") {
    return /\{.+\}/.test(path.split("/").filter(Boolean).at(-1) ?? "")
      ? `Get ${parentLabel}`
      : `List ${lastLabel}`;
  }
  if (method === "post") {
    if (["search", "plan", "apply", "sync", "upsert", "reserve", "mark-used"].includes(lastSegment)) {
      return `${titleCaseLabel(lastSegment)} ${parentLabel}`;
    }
    if (["create", "create-and-push", "bulk-update", "take-next-free"].includes(lastSegment)) {
      return titleCaseLabel(lastSegment);
    }
    return `Create ${lastLabel}`;
  }
  if (method === "patch") return `Update ${lastLabel}`;
  if (method === "put") return `Replace ${lastLabel}`;
  if (method === "delete") return `Delete ${lastLabel}`;
  return `${titleCaseLabel(method)} ${lastLabel}`;
}

function enrichOperation(path: string, method: string, rawOperation: JsonObject): JsonObject {
  const operation = { ...rawOperation };
  const summary = typeof operation.summary === "string" ? operation.summary.trim() : "";
  if (!summary) {
    operation.summary = buildFallbackSummary(method, path);
  }

  const description = typeof operation.description === "string" ? operation.description.trim() : "";
  if (!description) {
    operation.description = `${operation.summary}. Auto-generated from route path because source schema did not provide a description.`;
  }

  const responses =
    operation.responses && typeof operation.responses === "object"
      ? { ...(operation.responses as JsonObject) }
      : {};
  for (const [statusCode, responseValue] of Object.entries(responses)) {
    if (!responseValue || typeof responseValue !== "object") {
      continue;
    }
    const responseObject = { ...(responseValue as JsonObject) };
    const responseDescription =
      typeof responseObject.description === "string" ? responseObject.description.trim() : "";
    if (!responseDescription) {
      responseObject.description = defaultResponseDescription(statusCode);
    }
    responses[statusCode] = responseObject;
  }
  operation.responses = responses;

  return operation;
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
    const domain = getPathDomain(repoName, path);
    tagsMap.set(folderTag, {
      name: folderTag,
      description: `${displayRepoName(repoName)} endpoints grouped by ${titleCaseLabel(domain)}.`
    });

    const nextPathItem: JsonObject = { ...pathItem };
    for (const method of httpMethods) {
      const rawOperation = nextPathItem[method];
      if (!rawOperation || typeof rawOperation !== "object") {
        continue;
      }
      const operation = enrichOperation(path, method, rawOperation as JsonObject);
      const existingTags = Array.isArray(operation.tags) ? (operation.tags as string[]) : [];
      operation.tags = [folderTag, ...existingTags.filter((tag) => tag !== folderTag)];
      operation["x-repository"] = repoName;
      if (typeof operation.operationId === "string" && operation.operationId.trim()) {
        const pathKey = path
          .replace(/^\/+|\/+$/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
        operation.operationId = `${repoName}_${method}_${pathKey}`;
      }
      nextPathItem[method] = operation;
    }
    nextPaths[path] = nextPathItem;
  }

  return {
    paths: nextPaths,
    tags: Array.from(tagsMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  };
}

function remapPathForFrontendProxy(source: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const apiV1Match = normalizedPath.match(/^\/api\/v1(?:\/(.*))?$/i);
  const apiV1Suffix = apiV1Match?.[1]?.replace(/^\/+|\/+$/g, "") ?? "";

  if (source === "backend") {
    return normalizedPath;
  }

  if (source === "orchestrator") {
    if (/^\/api\/v1\/orchestrator(?:\/|$)/i.test(normalizedPath)) {
      return normalizedPath;
    }
    const suffix = apiV1Suffix;
    return suffix ? `/api/v1/orchestrator/${suffix}` : "/api/v1/orchestrator";
  }

  if (source === "services") {
    if (/^\/api\/v1\/(?:hood|jv|xl)(?:\/|$)/i.test(normalizedPath)) {
      return normalizedPath;
    }
    if (/^\/api\/v1\/uploads\/images(?:\/|$)/i.test(normalizedPath)) {
      return normalizedPath;
    }
    const suffix = apiV1Suffix;
    return suffix ? `/api/v1/services/${suffix}` : "/api/v1/services";
  }

  return normalizedPath;
}

function remapPathsForFrontendProxy(source: string, paths: Record<string, JsonObject>): Record<string, JsonObject> {
  return Object.fromEntries(Object.entries(paths).map(([path, pathItem]) => [remapPathForFrontendProxy(source, path), pathItem]));
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
    const sourcePaths = remapPathsForFrontendProxy(source, doc.paths ?? {});
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
      const sourceA = (Object.values(mergedPaths[a]).find(
        (value) => value && typeof value === "object" && typeof (value as JsonObject)["x-repository"] === "string"
      ) as JsonObject | undefined)?.["x-repository"] as string | undefined;
      const sourceB = (Object.values(mergedPaths[b]).find(
        (value) => value && typeof value === "object" && typeof (value as JsonObject)["x-repository"] === "string"
      ) as JsonObject | undefined)?.["x-repository"] as string | undefined;
      const repoA = sourceA ?? "other";
      const repoB = sourceB ?? "other";
      const repoOrderDiff = getSourceSortIndex(repoA) - getSourceSortIndex(repoB);
      if (repoOrderDiff !== 0) {
        return repoOrderDiff;
      }

      const domainA = getPathDomain(repoA, a);
      const domainB = getPathDomain(repoB, b);
      const domainOrderDiff = getDomainSortIndex(repoA, domainA) - getDomainSortIndex(repoB, domainB);
      if (domainOrderDiff !== 0) {
        return domainOrderDiff;
      }

      if (domainA !== domainB) {
        return domainA.localeCompare(domainB);
      }
      return a.localeCompare(b);
    })
  );
  const uniqueTags = Array.from(new Map(mergedTags.map((tag) => [tag.name, tag])).values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const groupedTagsMap = new Map<string, string[]>();
  for (const tag of uniqueTags) {
    const [repo, folder] = tag.name.split(" / ", 2);
    const groupName = repo || "Other";
    const groupTag = folder ? `${groupName} / ${folder}` : tag.name;
    const current = groupedTagsMap.get(groupName) ?? [];
    current.push(groupTag);
    groupedTagsMap.set(groupName, current);
  }
  const tagGroups = Array.from(groupedTagsMap.entries())
    .sort(([a], [b]) => getSourceSortIndex(a.toLowerCase()) - getSourceSortIndex(b.toLowerCase()))
    .map(([name, tags]) => ({
      name,
      tags: Array.from(new Set(tags)).sort((a, b) => {
        const domainA = a.split(" / ", 2)[1] ?? a;
        const domainB = b.split(" / ", 2)[1] ?? b;
        const orderDiff =
          getDomainSortIndex(name.toLowerCase(), domainA.toLowerCase()) -
          getDomainSortIndex(name.toLowerCase(), domainB.toLowerCase());
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return a.localeCompare(b);
      })
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
    const suffixes = /\/api\/v1$/i.test(base) ? ["/openapi.json"] : ["/api/v1/openapi.json"];
    for (const suffix of suffixes) {
      urls.push(`${base}${suffix}`);
    }
  }

  const uniqueUrls = Array.from(new Set(urls));
  for (const url of uniqueUrls) {
    const doc = await fetchJson(url, timeoutMs);
    if (doc) {
      return doc;
    }
  }
  return null;
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
