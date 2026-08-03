import { NextRequest, NextResponse } from "next/server";
import { createRequestId } from "../../../../../lib/api/request-id";
import { resolveBackendApiBaseCandidates, resolveOrchestratorApiBaseCandidates } from "../../../../../lib/api/upstream-base";

export const runtime = "nodejs";

function normalizeOrchestratorPath(rawPathPart: string): string {
  const trimmed = rawPathPart.replace(/^\/+|\/+$/g, "");
  return trimmed.replace(/^orchestrator\/?/i, "");
}

function resolveOrchestratorTarget(base: string, pathPart: string): string {
  const normalizedPath = normalizeOrchestratorPath(pathPart);
  const isControlPath = /^(healthz|readyz|metrics)(?:\/|$)/i.test(normalizedPath);
  if (isControlPath) {
    return `${base}/${normalizedPath}`;
  }
  return `${base}/orchestrator/${normalizedPath}`;
}

type VerifiedActor = {
  login: string;
  name: string;
};

function isMarketplaceToggleCreation(pathPart: string, method: string): boolean {
  return method === "POST" && normalizeOrchestratorPath(pathPart) === "marketplace/toggle-by-kid";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function verifyActor(authorizationHeader: string | null): Promise<VerifiedActor | null> {
  if (!authorizationHeader?.trim()) {
    return null;
  }

  for (const base of resolveBackendApiBaseCandidates()) {
    try {
      const response = await fetch(`${base}/auth/me`, {
        headers: { Authorization: authorizationHeader, Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as Record<string, unknown>;
      const login = readString(payload.login) || readString(payload.username);
      const name = [readString(payload.first_name), readString(payload.last_name)].filter(Boolean).join(" ") || login;
      if (login) {
        return { login, name };
      }
    } catch {
      // Try the next configured backend upstream.
    }
  }

  return null;
}

async function proxyToOrchestrator(request: NextRequest, path: string[]): Promise<NextResponse> {
  const query = request.nextUrl.search ?? "";
  const pathPart = path.join("/");
  const cookieHeader = request.headers.get("cookie") ?? "";
  const authorizationHeader = request.headers.get("authorization");
  const requestId = request.headers.get("x-request-id") ?? createRequestId();
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : Buffer.from(await request.arrayBuffer());

  const actor = isMarketplaceToggleCreation(pathPart, request.method)
    ? await verifyActor(authorizationHeader)
    : null;
  if (isMarketplaceToggleCreation(pathPart, request.method) && actor === null) {
    return NextResponse.json(
      {
        code: "marketplace_toggle_authentication_required",
        message: "Sign in again before changing marketplace availability.",
        request_id: requestId,
      },
      { status: 401, headers: { "x-request-id": requestId } }
    );
  }

  let lastError: unknown = null;
  const candidates = resolveOrchestratorApiBaseCandidates();

  for (const base of candidates) {
    const targetUrl = `${resolveOrchestratorTarget(base, pathPart)}${query}`;
    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          "content-type": request.headers.get("content-type") ?? "application/json",
          cookie: cookieHeader,
          ...(requestId ? { "x-request-id": requestId } : {}),
          ...(actor ? { "x-warehub-actor-login": actor.login, "x-warehub-actor-name": actor.name } : {}),
        },
        body,
        cache: "no-store"
      });

      const text = await response.text();
      return new NextResponse(text, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") ?? "application/json",
          "x-request-id": response.headers.get("x-request-id") ?? requestId
        }
      });
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Orchestrator proxy failed.";
  return NextResponse.json(
    {
      code: "orchestrator_proxy_failed",
      message,
      request_id: requestId || "",
      details: {}
    },
    { status: 502, headers: { "x-request-id": requestId } }
  );
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToOrchestrator(request, path);
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToOrchestrator(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToOrchestrator(request, path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToOrchestrator(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToOrchestrator(request, path);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToOrchestrator(request, path);
}
