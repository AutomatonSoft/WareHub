const DEFAULT_SERVICES_API_BASE = "http://localhost:8934/api/v1";
const DOCKER_SERVICES_API_BASE = "http://services:8000/api/v1";
const DEFAULT_BACKEND_API_BASE = "http://localhost:8932/api/v1";
const DOCKER_BACKEND_API_BASE = "http://backend:8932/api/v1";
const DEFAULT_ORCHESTRATOR_API_BASE = "http://localhost:8935/api/v1";
const DOCKER_ORCHESTRATOR_API_BASE = "http://orchestrator:8011/api/v1";

type RuntimeEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

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

function normalizeApiBase(value: string | undefined): string | null {
  const normalized = normalizeBase(value);
  if (!normalized) {
    return null;
  }
  return normalized.endsWith("/api/v1") ? normalized : `${normalized}/api/v1`;
}

function uniqueCandidates(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function resolveServicesApiBaseCandidates(env: RuntimeEnv = process.env): string[] {
  return uniqueCandidates([
    normalizeApiBase(env.SERVICES_INTERNAL_API_BASE_URL),
    normalizeApiBase(env.SERVICES_ORIGIN),
    normalizeApiBase(env.SERVICES_API_BASE_URL),
    DOCKER_SERVICES_API_BASE,
    DEFAULT_SERVICES_API_BASE
  ]);
}

export function resolveBackendApiBaseCandidates(env: RuntimeEnv = process.env): string[] {
  return uniqueCandidates([
    normalizeApiBase(env.BACKEND_INTERNAL_API_BASE_URL),
    normalizeApiBase(env.BACKEND_ORIGIN),
    normalizeApiBase(env.BACKEND_API_BASE_URL),
    DOCKER_BACKEND_API_BASE,
    DEFAULT_BACKEND_API_BASE
  ]);
}

export function resolveOrchestratorApiBaseCandidates(env: RuntimeEnv = process.env): string[] {
  return uniqueCandidates([
    normalizeApiBase(env.ORCHESTRATOR_INTERNAL_API_BASE_URL),
    normalizeApiBase(env.ORCHESTRATOR_ORIGIN),
    normalizeApiBase(env.ORCHESTRATOR_API_BASE_URL),
    DOCKER_ORCHESTRATOR_API_BASE,
    DEFAULT_ORCHESTRATOR_API_BASE
  ]);
}
