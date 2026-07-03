const SOURCE_ORDER = ["backend", "services", "orchestrator"] as const;
const COMPONENT_SECTIONS = [
  "schemas",
  "parameters",
  "responses",
  "requestBodies",
  "headers",
  "securitySchemes",
  "examples",
  "links",
  "callbacks",
  "pathItems"
] as const;
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head", "trace"] as const;

export const DEFAULT_SERVICES_API_BASE = "http://localhost:8934/api/v1";
export const DOCKER_SERVICES_API_BASE = "http://services:8000/api/v1";
export const DEFAULT_BACKEND_API_BASE = "http://localhost:8932";
export const DOCKER_BACKEND_API_BASE = "http://backend:8932";
export const DEFAULT_ORCHESTRATOR_API_BASE = "http://localhost:8935";
export const DOCKER_ORCHESTRATOR_API_BASE = "http://orchestrator:8011";

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}
export interface JsonArray extends Array<JsonValue> {}

export type OpenApiDocument = {
  openapi?: string;
  info?: JsonObject;
  jsonSchemaDialect?: string;
  servers?: Array<{ url: string; description?: string }>;
  paths?: Record<string, JsonObject>;
  webhooks?: Record<string, JsonObject>;
  components?: Record<string, JsonObject>;
  tags?: Array<{ name: string; description?: string }>;
  security?: JsonObject[];
  externalDocs?: JsonObject;
  "x-tagGroups"?: Array<{ name: string; tags: string[] }>;
};

export type OpenApiSourceDocument = {
  source: string;
  doc: OpenApiDocument;
};

export type OpenApiSourceSpec = {
  source: string;
  candidates: string[];
  timeoutMs: number;
};

type ComponentSectionName = (typeof COMPONENT_SECTIONS)[number];
type OpenApiEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

type MergeErrorCode =
  | "path_method_collision"
  | "unresolved_local_ref"
  | "unresolved_security_scheme"
  | "duplicate_source_id"
  | "source_prefix_collision"
  | "conflicting_json_schema_dialect"
  | "duplicate_operation_id";

type RefTarget = {
  section: string;
  key: string;
  suffix: string;
};

type SourceDescriptor = {
  source: string;
  prefix: string;
};

type SecurityRequirementObject = Record<string, string[]>;
type OperationRecord = {
  location: string;
  method: string;
  operation: JsonObject;
  source: string;
};

export class OpenApiMergeError extends Error {
  code: MergeErrorCode;
  details: JsonObject;

  constructor(code: MergeErrorCode, message: string, details: JsonObject) {
    super(message);
    this.name = "OpenApiMergeError";
    this.code = code;
    this.details = details;
  }
}

function cloneJsonValue<T extends JsonValue | undefined>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

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

function normalizeBackendBase(value: string | undefined): string | null {
  const normalized = normalizeBase(value);
  if (!normalized) {
    return null;
  }
  return normalized.replace(/\/api\/v1$/i, "");
}

function uniqueCandidates(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function resolveServicesBaseCandidates(env: OpenApiEnv = process.env): string[] {
  return uniqueCandidates([
    normalizeBase(env.SERVICES_INTERNAL_API_BASE_URL),
    normalizeBase(env.SERVICES_API_BASE_URL),
    DOCKER_SERVICES_API_BASE,
    DEFAULT_SERVICES_API_BASE
  ]);
}

export function resolveBackendBaseCandidates(env: OpenApiEnv = process.env): string[] {
  return uniqueCandidates([
    normalizeBackendBase(env.BACKEND_INTERNAL_API_BASE_URL),
    normalizeBackendBase(env.BACKEND_API_BASE_URL),
    DOCKER_BACKEND_API_BASE,
    DEFAULT_BACKEND_API_BASE
  ]);
}

export function resolveOrchestratorBaseCandidates(env: OpenApiEnv = process.env): string[] {
  return uniqueCandidates([
    normalizeBackendBase(env.ORCHESTRATOR_INTERNAL_API_BASE_URL),
    normalizeBackendBase(env.ORCHESTRATOR_API_BASE_URL),
    DOCKER_ORCHESTRATOR_API_BASE,
    DEFAULT_ORCHESTRATOR_API_BASE
  ]);
}

export function resolveAdditionalOpenApiSources(env: OpenApiEnv = process.env): Array<{ source: string; candidates: string[] }> {
  const raw = env.OPENAPI_EXTRA_SOURCES?.trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const separator = entry.indexOf("=");
      if (separator <= 0) {
        return [];
      }
      const source = entry.slice(0, separator).trim();
      const base = normalizeBackendBase(entry.slice(separator + 1));
      if (!source || !base) {
        return [];
      }
      return [{ source, candidates: [base] }];
    });
}

export function buildOpenApiSourceSpecs(
  env: OpenApiEnv,
  timeouts: { backend: number; services: number; orchestrator: number }
): OpenApiSourceSpec[] {
  const extraSources = resolveAdditionalOpenApiSources(env);
  return [
    { source: "backend", candidates: resolveBackendBaseCandidates(env), timeoutMs: timeouts.backend },
    { source: "services", candidates: resolveServicesBaseCandidates(env), timeoutMs: timeouts.services },
    { source: "orchestrator", candidates: resolveOrchestratorBaseCandidates(env), timeoutMs: timeouts.orchestrator },
    ...extraSources.map((item) => ({ source: item.source, candidates: item.candidates, timeoutMs: timeouts.services }))
  ];
}

export function buildOpenApiProxyFailureResponse(sourceSpecs: Array<{ source: string }>): Response {
  return new Response(
    JSON.stringify({
      detail: "OpenAPI schema proxy request failed",
      sources: sourceSpecs.map((spec) => spec.source)
    }),
    {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    }
  );
}

export function buildMergedOpenApiResponse(docs: OpenApiSourceDocument[], docsOrigin: string | null): Response {
  try {
    const merged = mergeSchemas(docs);
    if (docsOrigin) {
      merged.servers = [{ url: docsOrigin, description: "Local docs origin" }];
    }
    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.oai.openapi+json; charset=utf-8",
        "Cache-Control": "public, max-age=15"
      }
    });
  } catch (error) {
    if (error instanceof OpenApiMergeError) {
      return new Response(
        JSON.stringify({
          detail: "OpenAPI schema merge failed",
          code: error.code,
          ...error.details
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        }
      );
    }
    throw error;
  }
}

function extractSecuritySchemeRenameMap(renameMap: Map<string, string>): Map<string, string> {
  const schemeRenameMap = new Map<string, string>();

  for (const [oldRef, newRef] of renameMap.entries()) {
    const oldTarget = parseLocalComponentRef(oldRef);
    const newTarget = parseLocalComponentRef(newRef);
    if (!oldTarget || !newTarget || oldTarget.section !== "securitySchemes" || newTarget.section !== "securitySchemes") {
      continue;
    }
    schemeRenameMap.set(oldTarget.key, newTarget.key);
  }

  return schemeRenameMap;
}

function cloneSecurityRequirements(security: SecurityRequirementObject[]): SecurityRequirementObject[] {
  return security.map((requirement) => Object.fromEntries(Object.entries(requirement).map(([scheme, scopes]) => [scheme, [...scopes]])));
}

function rewriteSecurityRequirements(
  security: JsonValue | undefined,
  securitySchemeRenameMap: Map<string, string>
): SecurityRequirementObject[] | undefined {
  if (!Array.isArray(security)) {
    return undefined;
  }

  const rewritten: SecurityRequirementObject[] = [];
  for (const requirement of security) {
    if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) {
      continue;
    }

    const nextRequirement: SecurityRequirementObject = {};
    for (const [schemeName, scopes] of Object.entries(requirement)) {
      const rewrittenSchemeName = securitySchemeRenameMap.get(schemeName) ?? schemeName;
      nextRequirement[rewrittenSchemeName] = Array.isArray(scopes) ? scopes.filter((scope): scope is string => typeof scope === "string") : [];
    }
    rewritten.push(nextRequirement);
  }

  return rewritten;
}

function isReferenceObject(value: JsonObject): boolean {
  return typeof value.$ref === "string" && Object.keys(value).length === 1;
}

function processCallbackObjectSecurity(
  callbackObject: JsonObject,
  sourceDefaultSecurity: SecurityRequirementObject[] | undefined,
  securitySchemeRenameMap: Map<string, string>,
  source: string
): JsonObject {
  if (isReferenceObject(callbackObject)) {
    return callbackObject;
  }

  return Object.fromEntries(
    Object.entries(callbackObject).map(([callbackExpression, callbackPathItem]) => {
      if (!callbackPathItem || typeof callbackPathItem !== "object" || Array.isArray(callbackPathItem)) {
        return [callbackExpression, callbackPathItem];
      }

      return [
        callbackExpression,
        processPathItemSecurity(callbackPathItem as JsonObject, sourceDefaultSecurity, securitySchemeRenameMap, source)
      ];
    })
  );
}

function processPathItemSecurity(
  value: JsonObject,
  sourceDefaultSecurity: SecurityRequirementObject[] | undefined,
  securitySchemeRenameMap: Map<string, string>,
  source: string
): JsonObject {
  const next: JsonObject = { ...value };

  for (const method of HTTP_METHODS) {
    const operationValue = next[method];
    if (!operationValue || typeof operationValue !== "object" || Array.isArray(operationValue)) {
      continue;
    }

    const operation = { ...(operationValue as JsonObject) };
    if ("security" in operation) {
      const rewrittenSecurity = rewriteSecurityRequirements(operation.security, securitySchemeRenameMap);
      if (rewrittenSecurity !== undefined) {
        operation.security = rewrittenSecurity;
      }
    } else if (sourceDefaultSecurity) {
      operation.security = cloneSecurityRequirements(sourceDefaultSecurity);
    }

    operation["x-repository"] = source;

    const callbacksValue = operation.callbacks;
    if (callbacksValue && typeof callbacksValue === "object" && !Array.isArray(callbacksValue)) {
      const nextCallbacks: JsonObject = {};
      for (const [callbackName, callbackPathItemMap] of Object.entries(callbacksValue)) {
        if (!callbackPathItemMap || typeof callbackPathItemMap !== "object" || Array.isArray(callbackPathItemMap)) {
          nextCallbacks[callbackName] = callbackPathItemMap;
          continue;
        }
        nextCallbacks[callbackName] = processCallbackObjectSecurity(
          callbackPathItemMap as JsonObject,
          sourceDefaultSecurity,
          securitySchemeRenameMap,
          source
        );
      }
      operation.callbacks = nextCallbacks;
    }

    next[method] = operation;
  }

  return next;
}

function materializeSecurityForDocument(
  doc: OpenApiDocument,
  renameMap: Map<string, string>,
  source: string
): OpenApiDocument {
  const securitySchemeRenameMap = extractSecuritySchemeRenameMap(renameMap);
  const nextDoc = cloneJsonValue(doc as JsonValue) as OpenApiDocument;
  const sourceDefaultSecurity = rewriteSecurityRequirements(nextDoc.security as JsonValue | undefined, securitySchemeRenameMap);

  if (nextDoc.paths) {
    nextDoc.paths = Object.fromEntries(
      Object.entries(nextDoc.paths).map(([path, pathItem]) => [path, processPathItemSecurity(pathItem, sourceDefaultSecurity, securitySchemeRenameMap, source)])
    );
  }

  if (nextDoc.webhooks) {
    nextDoc.webhooks = Object.fromEntries(
      Object.entries(nextDoc.webhooks).map(([webhookName, pathItem]) => [
        webhookName,
        processPathItemSecurity(pathItem, sourceDefaultSecurity, securitySchemeRenameMap, source)
      ])
    );
  }

  if (nextDoc.components?.pathItems && typeof nextDoc.components.pathItems === "object" && !Array.isArray(nextDoc.components.pathItems)) {
    nextDoc.components.pathItems = Object.fromEntries(
      Object.entries(nextDoc.components.pathItems).map(([pathItemName, pathItem]) => [
        pathItemName,
        processPathItemSecurity(pathItem as JsonObject, sourceDefaultSecurity, securitySchemeRenameMap, source)
      ])
    );
  }

  if (nextDoc.components?.callbacks && typeof nextDoc.components.callbacks === "object" && !Array.isArray(nextDoc.components.callbacks)) {
    nextDoc.components.callbacks = Object.fromEntries(
      Object.entries(nextDoc.components.callbacks).map(([callbackName, callbackObject]) => {
        if (!callbackObject || typeof callbackObject !== "object" || Array.isArray(callbackObject)) {
          return [callbackName, callbackObject];
        }

        return [
          callbackName,
          processCallbackObjectSecurity(callbackObject as JsonObject, sourceDefaultSecurity, securitySchemeRenameMap, source)
        ];
      })
    );
  }

  if (nextDoc.security) {
    delete nextDoc.security;
  }

  return nextDoc;
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
    telegram: "Telegram",
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

function compareSources(a: string, b: string): number {
  const sortDiff = getSourceSortIndex(a) - getSourceSortIndex(b);
  if (sortDiff !== 0) {
    return sortDiff;
  }
  return a.localeCompare(b);
}

function getDomainSortIndex(repoName: string, domain: string): number {
  const normalizedDomainKey = domain.trim().toLowerCase().replace(/\s+/g, "-");
  const domainOrders: Record<string, string[]> = {
    backend: ["system", "mobile", "logs", "auth", "admin", "intakes", "kids", "label-layout", "printer-setup", "uploads", "afterbuy"],
    services: ["system", "session", "kids", "orders", "inventory", "ean-pool", "uploads", "afterbuy", "kaufland", "marketplace", "telegram", "hood", "otto", "xl", "jv"],
    orchestrator: ["system", "jobs", "product-editor", "products", "reconciliation"]
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
    if (segments[2] === "backend" || segments[2] === "services" || segments[2] === "orchestrator") {
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
    .filter((segment) => !["api", "v1", "backend", "services", "orchestrator"].includes(segment))
    .filter((segment) => !/^\{.+\}$/.test(segment));
  const lastSegment = segments[segments.length - 1] ?? "resource";
  const parentSegment = segments[segments.length - 2] ?? lastSegment;
  const lastLabel = titleCaseLabel(lastSegment);
  const parentLabel = titleCaseLabel(parentSegment);

  if (method === "get") {
    return /\{.+\}/.test(path.split("/").filter(Boolean).at(-1) ?? "") ? `Get ${parentLabel}` : `List ${lastLabel}`;
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

  const responses = operation.responses && typeof operation.responses === "object" ? { ...(operation.responses as JsonObject) } : {};
  for (const [statusCode, responseValue] of Object.entries(responses)) {
    if (!responseValue || typeof responseValue !== "object" || Array.isArray(responseValue)) {
      continue;
    }
    const responseObject = { ...(responseValue as JsonObject) };
    const responseDescription = typeof responseObject.description === "string" ? responseObject.description.trim() : "";
    if (!responseDescription) {
      responseObject.description = defaultResponseDescription(statusCode);
    }
    responses[statusCode] = responseObject;
  }
  operation.responses = responses;

  return operation;
}

function addRepoTagsToPaths(
  repoName: string,
  paths: Record<string, JsonObject>
): { paths: Record<string, JsonObject>; tags: Array<{ name: string; description?: string }> } {
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
    for (const method of HTTP_METHODS) {
      const rawOperation = nextPathItem[method];
      if (!rawOperation || typeof rawOperation !== "object" || Array.isArray(rawOperation)) {
        continue;
      }
      const operation = enrichOperation(path, method, rawOperation as JsonObject);
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

export function remapPathForFrontendProxy(source: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (source === "backend") {
    if (/^\/api\/v1\/backend(?:\/|$)/i.test(normalizedPath)) {
      return normalizedPath;
    }
    const suffix = normalizedPath.replace(/^\/api\/v1(?:\/|$)/i, "").replace(/^\/+/, "");
    return suffix ? `/api/v1/backend/${suffix}` : "/api/v1/backend";
  }

  if (source === "services") {
    if (/^\/api\/v1\/services(?:\/|$)/i.test(normalizedPath)) {
      return normalizedPath;
    }
    const suffix = normalizedPath.replace(/^\/api\/v1(?:\/|$)/i, "").replace(/^\/+/, "");
    return suffix ? `/api/v1/services/${suffix}` : "/api/v1/services";
  }

  if (source === "orchestrator") {
    if (/^\/api\/v1\/orchestrator(?:\/|$)/i.test(normalizedPath)) {
      return normalizedPath;
    }
    const suffix = normalizedPath.replace(/^\/api\/v1(?:\/|$)/i, "").replace(/^\/+/, "");
    return suffix ? `/api/v1/orchestrator/${suffix}` : "/api/v1/orchestrator";
  }

  return normalizedPath;
}

function remapPathsForFrontendProxy(source: string, paths: Record<string, JsonObject>): Record<string, JsonObject> {
  return Object.fromEntries(Object.entries(paths).map(([path, pathItem]) => [remapPathForFrontendProxy(source, path), pathItem]));
}

function decodeJsonPointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function encodeJsonPointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

function sanitizeSourcePrefix(source: string): string {
  return source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseLocalComponentRef(ref: string): RefTarget | null {
  if (!ref.startsWith("#/components/")) {
    return null;
  }

  const tokens = ref.slice(2).split("/");
  if (tokens.length < 3 || tokens[0] !== "components") {
    return null;
  }

  return {
    section: decodeJsonPointerToken(tokens[1]),
    key: decodeJsonPointerToken(tokens[2]),
    suffix: tokens.length > 3 ? `/${tokens.slice(3).join("/")}` : ""
  };
}

function buildLocalComponentRef(section: string, key: string, suffix = ""): string {
  return `#/components/${encodeJsonPointerToken(section)}/${encodeJsonPointerToken(key)}${suffix}`;
}

function getLocalComponentRootRef(target: RefTarget): string {
  return buildLocalComponentRef(target.section, target.key);
}

function rewriteLocalComponentRef(ref: string, renameMap: Map<string, string>): string {
  const target = parseLocalComponentRef(ref);
  if (!target) {
    return ref;
  }

  const renamedRootRef = renameMap.get(getLocalComponentRootRef(target));
  if (!renamedRootRef) {
    return ref;
  }

  const renamedTarget = parseLocalComponentRef(renamedRootRef);
  if (!renamedTarget) {
    return ref;
  }

  return buildLocalComponentRef(renamedTarget.section, renamedTarget.key, target.suffix);
}

function rewriteLocalRefs(value: JsonValue | undefined, renameMap: Map<string, string>): JsonValue | undefined {
  if (Array.isArray(value)) {
    return value
      .map((item) => rewriteLocalRefs(item, renameMap))
      .filter((item): item is JsonValue => item !== undefined);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string") {
      next[key] = rewriteLocalComponentRef(child, renameMap);
      continue;
    }

    if (key === "mapping" && typeof child === "object" && child && !Array.isArray(child)) {
      const rewrittenMapping: JsonObject = {};
      for (const [mappingKey, mappingValue] of Object.entries(child)) {
        rewrittenMapping[mappingKey] =
          typeof mappingValue === "string" ? rewriteLocalComponentRef(mappingValue, renameMap) : rewriteLocalRefs(mappingValue, renameMap);
      }
      next[key] = rewrittenMapping;
      continue;
    }

    next[key] = rewriteLocalRefs(child, renameMap);
  }
  return next;
}

function buildSourceDescriptors(docs: OpenApiSourceDocument[]): SourceDescriptor[] {
  const exactSourceMap = new Map<string, string>();
  const prefixMap = new Map<string, string>();

  for (const { source } of docs) {
    if (exactSourceMap.has(source)) {
      throw new OpenApiMergeError("duplicate_source_id", `Duplicate OpenAPI source id detected: ${source}.`, {
        source
      });
    }
    exactSourceMap.set(source, source);

    const prefix = sanitizeSourcePrefix(source);
    if (!prefix) {
      throw new OpenApiMergeError("source_prefix_collision", `OpenAPI source id cannot be normalized into a component-safe prefix: ${source}.`, {
        source
      });
    }
    const existingSource = prefixMap.get(prefix);
    if (existingSource && existingSource !== source) {
      throw new OpenApiMergeError(
        "source_prefix_collision",
        `Multiple OpenAPI source ids normalize to the same component prefix: ${prefix}.`,
        {
          prefix,
          sources: [existingSource, source].sort(compareSources)
        }
      );
    }
    prefixMap.set(prefix, source);
  }

  return docs
    .map(({ source }) => ({ source, prefix: sanitizeSourcePrefix(source) }))
    .sort((a, b) => compareSources(a.source, b.source));
}

function allocateComponentKey(preferredKey: string, reservedKeys: Set<string>): string {
  if (!reservedKeys.has(preferredKey)) {
    reservedKeys.add(preferredKey);
    return preferredKey;
  }

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${preferredKey}_${suffix}`;
    if (!reservedKeys.has(candidate)) {
      reservedKeys.add(candidate);
      return candidate;
    }
  }

  throw new OpenApiMergeError("source_prefix_collision", `Unable to allocate a unique OpenAPI component key for ${preferredKey}.`, {
    preferred_key: preferredKey
  });
}

function buildCollisionRenameMap(docs: OpenApiSourceDocument[]): Map<string, Map<string, string>> {
  const sourceDescriptors = buildSourceDescriptors(docs);
  const docsBySource = new Map(docs.map((item) => [item.source, item.doc]));
  const perSource = new Map<string, Map<string, string>>(sourceDescriptors.map((item) => [item.source, new Map<string, string>()]));

  for (const section of COMPONENT_SECTIONS) {
    const reservedKeys = new Set<string>();
    const ownersByKey = new Map<string, string[]>();

    for (const { source } of sourceDescriptors) {
      const doc = docsBySource.get(source) as OpenApiDocument;
      const sectionValue = doc.components?.[section];
      if (!sectionValue || typeof sectionValue !== "object" || Array.isArray(sectionValue)) {
        continue;
      }

      for (const key of Object.keys(sectionValue).sort()) {
        reservedKeys.add(key);
        const owners = ownersByKey.get(key) ?? [];
        owners.push(source);
        ownersByKey.set(key, owners);
      }
    }

    for (const key of Array.from(ownersByKey.keys()).sort()) {
      const owners = (ownersByKey.get(key) ?? []).sort(compareSources);
      if (owners.length < 2) {
        continue;
      }

      for (const owner of owners) {
        const descriptor = sourceDescriptors.find((item) => item.source === owner) as SourceDescriptor;
        const allocatedKey = allocateComponentKey(`${descriptor.prefix}_${key}`, reservedKeys);
        const sourceRenameMap = perSource.get(owner) as Map<string, string>;
        sourceRenameMap.set(buildLocalComponentRef(section, key), buildLocalComponentRef(section, allocatedKey));
      }
    }
  }

  return perSource;
}

function renameComponentSectionKeys(components: Record<string, JsonObject>, renameMap: Map<string, string>): Record<string, JsonObject> {
  const nextComponents: Record<string, JsonObject> = { ...components };

  for (const section of COMPONENT_SECTIONS) {
    const sectionValue = nextComponents[section];
    if (!sectionValue || typeof sectionValue !== "object" || Array.isArray(sectionValue)) {
      continue;
    }

    const nextSection: JsonObject = {};
    for (const [key, value] of Object.entries(sectionValue)) {
      const renamedRef = renameMap.get(buildLocalComponentRef(section, key));
      const nextKey = renamedRef ? (parseLocalComponentRef(renamedRef)?.key ?? key) : key;
      nextSection[nextKey] = value;
    }
    nextComponents[section] = nextSection;
  }

  return nextComponents;
}

function applyComponentRenamesToDocument(doc: OpenApiDocument, renameMap: Map<string, string>, source: string): OpenApiDocument {
  const securityMaterializedDoc = materializeSecurityForDocument(doc, renameMap, source);
  const rewrittenDoc = rewriteLocalRefs(cloneJsonValue(securityMaterializedDoc as JsonValue), renameMap) as OpenApiDocument;
  if (!rewrittenDoc.components) {
    return rewrittenDoc;
  }

  rewrittenDoc.components = renameComponentSectionKeys(rewrittenDoc.components, renameMap);
  return rewrittenDoc;
}

function validateLocalRefs(doc: OpenApiDocument): void {
  const components = doc.components ?? {};
  const unresolved = new Set<string>();

  function ensureComponentExists(ref: string): void {
    const target = parseLocalComponentRef(ref);
    if (!target) {
      return;
    }

    const sectionValue = components[target.section];
    if (!sectionValue || typeof sectionValue !== "object" || Array.isArray(sectionValue) || !(target.key in sectionValue)) {
      unresolved.add(ref);
    }
  }

  function visit(value: JsonValue | undefined): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string") {
        ensureComponentExists(child);
        continue;
      }

      if (key === "mapping" && typeof child === "object" && child && !Array.isArray(child)) {
        for (const mappingValue of Object.values(child)) {
          if (typeof mappingValue === "string") {
            ensureComponentExists(mappingValue);
          } else {
            visit(mappingValue);
          }
        }
        continue;
      }

      visit(child);
    }
  }

  visit(doc as unknown as JsonValue);

  if (unresolved.size > 0) {
    throw new OpenApiMergeError("unresolved_local_ref", "Merged OpenAPI contains unresolved local component refs.", {
      refs: Array.from(unresolved).sort()
    });
  }
}

function validateSecurityRequirements(doc: OpenApiDocument): void {
  const knownSchemes = doc.components?.securitySchemes;

  function ensureSchemeExists(schemeName: string, context: { location: string; method?: string; source?: string }): void {
    if (!schemeName) {
      return;
    }
    if (knownSchemes && typeof knownSchemes === "object" && !Array.isArray(knownSchemes) && schemeName in knownSchemes) {
      return;
    }

    throw new OpenApiMergeError("unresolved_security_scheme", `Merged OpenAPI contains unresolved security scheme ${schemeName}.`, {
      scheme: schemeName,
      location: context.location,
      ...(context.method ? { method: context.method } : {}),
      ...(context.source ? { source: context.source } : {})
    });
  }

  function visitPathItem(pathItem: JsonObject, location: string): void {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
        continue;
      }
      visitOperation(operation as JsonObject, location, method.toUpperCase());
    }
  }

  function visitCallbackObject(callbackObject: JsonObject, location: string): void {
    if (isReferenceObject(callbackObject)) {
      return;
    }

    for (const [callbackExpression, callbackPathItem] of Object.entries(callbackObject)) {
      if (!callbackPathItem || typeof callbackPathItem !== "object" || Array.isArray(callbackPathItem)) {
        continue;
      }
      visitPathItem(callbackPathItem as JsonObject, `${location} ${callbackExpression}`);
    }
  }

  function visitOperation(operation: JsonObject, location: string, method: string): void {
    const security = operation.security;
    const source = typeof operation["x-repository"] === "string" ? (operation["x-repository"] as string) : undefined;
    if (Array.isArray(security)) {
      for (const requirement of security) {
        if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) {
          continue;
        }
        for (const schemeName of Object.keys(requirement)) {
          ensureSchemeExists(schemeName, { location, method, source });
        }
      }
    }

    const callbacks = operation.callbacks;
    if (callbacks && typeof callbacks === "object" && !Array.isArray(callbacks)) {
      for (const [callbackName, callbackPathItemMap] of Object.entries(callbacks)) {
        if (!callbackPathItemMap || typeof callbackPathItemMap !== "object" || Array.isArray(callbackPathItemMap)) {
          continue;
        }
        visitCallbackObject(callbackPathItemMap as JsonObject, `${location} callback ${callbackName}`);
      }
    }
  }

  if (doc.paths) {
    for (const [path, pathItem] of Object.entries(doc.paths)) {
      visitPathItem(pathItem, path);
    }
  }

  if (doc.webhooks) {
    for (const [webhookName, pathItem] of Object.entries(doc.webhooks)) {
      visitPathItem(pathItem, `webhook ${webhookName}`);
    }
  }

  if (doc.components?.pathItems && typeof doc.components.pathItems === "object" && !Array.isArray(doc.components.pathItems)) {
    for (const [pathItemName, pathItem] of Object.entries(doc.components.pathItems)) {
      if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) {
        continue;
      }
      visitPathItem(pathItem as JsonObject, `component pathItem ${pathItemName}`);
    }
  }

  if (doc.components?.callbacks && typeof doc.components.callbacks === "object" && !Array.isArray(doc.components.callbacks)) {
    for (const [callbackName, callbackObject] of Object.entries(doc.components.callbacks)) {
      if (!callbackObject || typeof callbackObject !== "object" || Array.isArray(callbackObject)) {
        continue;
      }
      visitCallbackObject(callbackObject as JsonObject, `component callback ${callbackName}`);
    }
  }
}

function resolveJsonSchemaDialect(docs: OpenApiSourceDocument[]): string | undefined {
  const dialects = Array.from(new Set(docs.map(({ doc }) => doc.jsonSchemaDialect).filter((value): value is string => Boolean(value))));
  if (dialects.length === 0) {
    return undefined;
  }
  if (dialects.length === 1) {
    return dialects[0];
  }

  throw new OpenApiMergeError("conflicting_json_schema_dialect", "OpenAPI sources define conflicting jsonSchemaDialect values.", {
    dialects: dialects.sort()
  });
}

function sanitizeOperationIdSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildGeneratedLocationSegment(location: string): string {
  return location
    .replace(/~1/g, "slash")
    .replace(/~0/g, "tilde")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function collectOperationsFromPathItem(pathItem: JsonObject, location: string, records: OperationRecord[]): void {
  for (const method of HTTP_METHODS) {
    const operationValue = pathItem[method];
    if (!operationValue || typeof operationValue !== "object" || Array.isArray(operationValue)) {
      continue;
    }
    const operation = operationValue as JsonObject;
    const source = typeof operation["x-repository"] === "string" ? (operation["x-repository"] as string) : "unknown";
    records.push({
      location,
      method,
      operation,
      source
    });

    const callbacks = operation.callbacks;
    if (callbacks && typeof callbacks === "object" && !Array.isArray(callbacks)) {
      for (const [callbackName, callbackObject] of Object.entries(callbacks)) {
        if (!callbackObject || typeof callbackObject !== "object" || Array.isArray(callbackObject)) {
          continue;
        }
        collectOperationsFromCallbackObject(callbackObject as JsonObject, `${location} callback ${callbackName}`, records);
      }
    }
  }
}

function collectOperationsFromCallbackObject(callbackObject: JsonObject, location: string, records: OperationRecord[]): void {
  if (isReferenceObject(callbackObject)) {
    return;
  }

  for (const [callbackExpression, callbackPathItem] of Object.entries(callbackObject)) {
    if (!callbackPathItem || typeof callbackPathItem !== "object" || Array.isArray(callbackPathItem)) {
      continue;
    }
    collectOperationsFromPathItem(callbackPathItem as JsonObject, `${location} ${callbackExpression}`, records);
  }
}

function collectOperationRecords(doc: OpenApiDocument): OperationRecord[] {
  const records: OperationRecord[] = [];

  if (doc.paths) {
    for (const [path, pathItem] of Object.entries(doc.paths)) {
      collectOperationsFromPathItem(pathItem, path, records);
    }
  }

  if (doc.webhooks) {
    for (const [webhookName, pathItem] of Object.entries(doc.webhooks)) {
      collectOperationsFromPathItem(pathItem, `webhook ${webhookName}`, records);
    }
  }

  if (doc.components?.pathItems && typeof doc.components.pathItems === "object" && !Array.isArray(doc.components.pathItems)) {
    for (const [pathItemName, pathItem] of Object.entries(doc.components.pathItems)) {
      if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) {
        continue;
      }
      collectOperationsFromPathItem(pathItem as JsonObject, `component pathItem ${pathItemName}`, records);
    }
  }

  if (doc.components?.callbacks && typeof doc.components.callbacks === "object" && !Array.isArray(doc.components.callbacks)) {
    for (const [callbackName, callbackObject] of Object.entries(doc.components.callbacks)) {
      if (!callbackObject || typeof callbackObject !== "object" || Array.isArray(callbackObject)) {
        continue;
      }
      collectOperationsFromCallbackObject(callbackObject as JsonObject, `component callback ${callbackName}`, records);
    }
  }

  return records;
}

function buildOperationIdBase(record: OperationRecord): string {
  const sourcePrefix = sanitizeSourcePrefix(record.source) || "source";
  const existingOperationId =
    typeof record.operation.operationId === "string" && record.operation.operationId.trim() ? record.operation.operationId.trim() : "";

  if (existingOperationId) {
    const normalizedOriginalId = sanitizeOperationIdSegment(existingOperationId) || "operation";
    return `${sourcePrefix}_${normalizedOriginalId}`;
  }

  const locationSegment = buildGeneratedLocationSegment(record.location) || "operation";
  return `${sourcePrefix}_${record.method}_${locationSegment}`;
}

function assignUniqueOperationIds(doc: OpenApiDocument): void {
  const records = collectOperationRecords(doc).sort((a, b) => {
    const locationDiff = a.location.localeCompare(b.location);
    if (locationDiff !== 0) {
      return locationDiff;
    }
    const methodDiff = a.method.localeCompare(b.method);
    if (methodDiff !== 0) {
      return methodDiff;
    }
    return compareSources(a.source, b.source);
  });

  const usedIds = new Set<string>();
  for (const record of records) {
    const baseId = buildOperationIdBase(record);
    let candidate = baseId;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${baseId}_${suffix}`;
      suffix += 1;
    }
    record.operation.operationId = candidate;
    usedIds.add(candidate);
  }
}

export function validateOperationIds(doc: OpenApiDocument): void {
  const seen = new Map<string, { location: string; method: string; source: string }>();

  for (const record of collectOperationRecords(doc)) {
    const operationId = typeof record.operation.operationId === "string" ? record.operation.operationId.trim() : "";
    if (!operationId) {
      continue;
    }

    const existing = seen.get(operationId);
    if (existing) {
      throw new OpenApiMergeError("duplicate_operation_id", `Merged OpenAPI contains duplicate operationId ${operationId}.`, {
        operationId,
        first_location: existing.location,
        first_method: existing.method.toUpperCase(),
        first_source: existing.source,
        second_location: record.location,
        second_method: record.method.toUpperCase(),
        second_source: record.source
      });
    }

    seen.set(operationId, {
      location: record.location,
      method: record.method,
      source: record.source
    });
  }
}

function mergePathItemCollections(
  targetCollection: Record<string, JsonObject>,
  source: string,
  incomingCollection: Record<string, JsonObject>
): void {
  for (const [path, pathItem] of Object.entries(incomingCollection)) {
    if (!(path in targetCollection)) {
      targetCollection[path] = pathItem;
      continue;
    }

    const existingPathItem = targetCollection[path];
    const nextPathItem: JsonObject = { ...existingPathItem };
    for (const [key, value] of Object.entries(pathItem)) {
      const normalizedMethod = key.toLowerCase();
      if (HTTP_METHODS.includes(normalizedMethod as (typeof HTTP_METHODS)[number]) && key in nextPathItem) {
        const existingOperation = nextPathItem[key];
        const existingSource =
          existingOperation && typeof existingOperation === "object" && !Array.isArray(existingOperation)
            ? ((existingOperation as JsonObject)["x-repository"] as string | undefined) ?? "unknown"
            : "unknown";
        throw new OpenApiMergeError(
          "path_method_collision",
          `OpenAPI path-method collision detected for ${key.toUpperCase()} ${path}.`,
          {
            path,
            method: key.toUpperCase(),
            sources: [existingSource, source].sort(compareSources)
          }
        );
      }
      nextPathItem[key] = value;
    }
    targetCollection[path] = nextPathItem;
  }
}

function mergeComponentSections(docs: OpenApiSourceDocument[]): Record<string, JsonObject> {
  const mergedComponents: Record<string, JsonObject> = {};

  for (const { doc } of docs) {
    const sourceComponents = doc.components ?? {};
    for (const [sectionName, sectionValue] of Object.entries(sourceComponents)) {
      if (!sectionValue || typeof sectionValue !== "object" || Array.isArray(sectionValue)) {
        continue;
      }
      const existingSection = mergedComponents[sectionName];
      mergedComponents[sectionName] = {
        ...(existingSection && typeof existingSection === "object" ? existingSection : {}),
        ...(sectionValue as JsonObject)
      };
    }
  }

  return mergedComponents;
}

function prepareDocumentsForMerge(docs: OpenApiSourceDocument[]): OpenApiSourceDocument[] {
  const renameMapBySource = buildCollisionRenameMap(docs);

  return docs
    .map(({ source, doc }) => ({
      source,
      doc: applyComponentRenamesToDocument(doc, renameMapBySource.get(source) ?? new Map<string, string>(), source)
    }))
    .sort((a, b) => compareSources(a.source, b.source));
}

export function mergeSchemas(docs: OpenApiSourceDocument[]): OpenApiDocument {
  const preparedDocs = prepareDocumentsForMerge(docs);
  const mergedPaths: Record<string, JsonObject> = {};
  const mergedWebhooks: Record<string, JsonObject> = {};
  const mergedTags: Array<{ name: string; description?: string }> = [];
  const jsonSchemaDialect = resolveJsonSchemaDialect(preparedDocs);

  for (const { source, doc } of preparedDocs) {
    const sourcePaths = remapPathsForFrontendProxy(source, doc.paths ?? {});
    const withTags = addRepoTagsToPaths(source, sourcePaths);
    mergePathItemCollections(mergedPaths, source, withTags.paths);
    mergedTags.push(...withTags.tags);

    if (doc.webhooks) {
      mergePathItemCollections(mergedWebhooks, source, doc.webhooks);
    }
  }

  const mergedComponents = mergeComponentSections(preparedDocs);
  const sortedPaths = Object.fromEntries(
    Object.entries(mergedPaths).sort(([a], [b]) => {
      const sourceA = (Object.values(mergedPaths[a]).find(
        (value) => value && typeof value === "object" && !Array.isArray(value) && typeof (value as JsonObject)["x-repository"] === "string"
      ) as JsonObject | undefined)?.["x-repository"] as string | undefined;
      const sourceB = (Object.values(mergedPaths[b]).find(
        (value) => value && typeof value === "object" && !Array.isArray(value) && typeof (value as JsonObject)["x-repository"] === "string"
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
          getDomainSortIndex(name.toLowerCase(), domainA.toLowerCase()) - getDomainSortIndex(name.toLowerCase(), domainB.toLowerCase());
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return a.localeCompare(b);
      })
    }));

  // Unified top-level field strategy:
  // - info: generated by the aggregator
  // - openapi: always emitted as 3.1.0
  // - servers: injected later from request origin
  // - paths/webhooks/components/tags: merged explicitly
  // - security: materialized per source operation before merge, never emitted globally
  // - jsonSchemaDialect: preserved only when every source uses the same value
  // - externalDocs and unknown top-level x-* source metadata: intentionally not merged globally
  //   because they are source-specific metadata and would be ambiguous in the unified contract.
  const merged: OpenApiDocument = {
    openapi: "3.1.0",
    info: {
      title: "WareHub Unified API",
      version: "v1",
      description: "Combined OpenAPI schema from backend, services and orchestrator repositories."
    },
    paths: sortedPaths,
    components: mergedComponents,
    tags: uniqueTags,
    "x-tagGroups": tagGroups
  };

  if (Object.keys(mergedWebhooks).length > 0) {
    merged.webhooks = Object.fromEntries(Object.entries(mergedWebhooks).sort(([a], [b]) => a.localeCompare(b)));
  }

  assignUniqueOperationIds(merged);
  validateLocalRefs(merged);
  validateSecurityRequirements(merged);
  validateOperationIds(merged);

  if (jsonSchemaDialect) {
    merged.jsonSchemaDialect = jsonSchemaDialect;
  }

  return merged;
}
