import {
  buildOpenApiSourceSpecs,
  buildMergedOpenApiResponse,
  buildOpenApiProxyFailureResponse,
  type OpenApiDocument
} from "./openapi-merge";

const OPENAPI_CACHE_TTL_MS = 30_000;
export const runtime = "nodejs";

const SERVICES_OPENAPI_TIMEOUT_MS = 12_000;
const BACKEND_OPENAPI_TIMEOUT_MS = 3_000;
const ORCHESTRATOR_OPENAPI_TIMEOUT_MS = 7_000;
let openApiCache: { value: OpenApiDocument; expiresAt: number } | null = null;

export function clearOpenApiCacheForTests(): void {
  openApiCache = null;
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
    const url = new URL(request.url);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
    }
    return url.origin;
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

  const sourceSpecs = buildOpenApiSourceSpecs(process.env, {
    backend: BACKEND_OPENAPI_TIMEOUT_MS,
    services: SERVICES_OPENAPI_TIMEOUT_MS,
    orchestrator: ORCHESTRATOR_OPENAPI_TIMEOUT_MS
  });
  const docs = (
    await Promise.all(
      sourceSpecs.map(async (spec) => {
        const doc = await fetchFirstOpenApiDocument(spec.candidates, spec.timeoutMs);
        return doc ? { source: spec.source, doc } : null;
      })
    )
  ).filter((item): item is { source: string; doc: OpenApiDocument } => Boolean(item));

  if (docs.length === 0) {
    return buildOpenApiProxyFailureResponse(sourceSpecs);
  }

  const response = buildMergedOpenApiResponse(docs, docsOrigin);
  if (response.status !== 200) {
    return response;
  }

  const merged = (await response.clone().json()) as OpenApiDocument;
  openApiCache = {
    value: merged,
    expiresAt: Date.now() + OPENAPI_CACHE_TTL_MS
  };

  return response;
}
