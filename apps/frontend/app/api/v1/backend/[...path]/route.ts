import { NextRequest, NextResponse } from "next/server";
import { createRequestId } from "../../../../../lib/api/request-id";

export const runtime = "nodejs";

function normalizeBaseUrl(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  return normalized.replace(/\/+$/, "");
}

function buildCandidates(): string[] {
  const candidates = [
    normalizeBaseUrl(process.env.BACKEND_INTERNAL_API_BASE_URL),
    normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    "http://127.0.0.1:8932/api/v1",
    "http://localhost:8932/api/v1"
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
}

async function proxyToBackend(request: NextRequest, path: string[]): Promise<NextResponse> {
  const query = request.nextUrl.search ?? "";
  const pathPart = path.join("/");
  const cookieHeader = request.headers.get("cookie") ?? "";
  const authorizationHeader = request.headers.get("authorization");
  const requestId = request.headers.get("x-request-id") ?? createRequestId();
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : Buffer.from(await request.arrayBuffer());

  let lastError: unknown = null;
  const configuredCandidates = buildCandidates();
  const candidates = request.method === "GET" || request.method === "HEAD" ? configuredCandidates : [configuredCandidates[0]];

  for (const base of candidates) {
    const targetUrl = `${base}/${pathPart}${query}`;
    try {
      const headers: Record<string, string> = {
        "content-type": request.headers.get("content-type") ?? "application/json",
        cookie: cookieHeader,
        "x-request-id": requestId
      };
      if (authorizationHeader) {
        headers.authorization = authorizationHeader;
      }

      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body,
        cache: "no-store"
      });

      const text = await response.text();
      const proxiedResponse = new NextResponse(text, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") ?? "application/json",
          "x-request-id": response.headers.get("x-request-id") ?? requestId
        }
      });
      const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
      const setCookieValues =
        typeof responseHeaders.getSetCookie === "function"
          ? responseHeaders.getSetCookie()
          : response.headers.get("set-cookie")
            ? [response.headers.get("set-cookie") as string]
            : [];
      for (const cookieValue of setCookieValues) {
        proxiedResponse.headers.append("set-cookie", cookieValue);
      }
      return proxiedResponse;
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Backend proxy failed.";
  return NextResponse.json(
    { detail: message, request_id: requestId },
    { status: 502, headers: { "x-request-id": requestId } }
  );
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(request, path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(request, path);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(request, path);
}
