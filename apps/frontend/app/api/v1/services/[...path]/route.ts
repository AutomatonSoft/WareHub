import { NextRequest, NextResponse } from "next/server";
import { createRequestId } from "../../../../../lib/api/request-id";

export const runtime = "nodejs";

const CANDIDATES = [
  "http://127.0.0.1:8934/api/v1",
  "http://localhost:8934/api/v1",
  "http://services:8000/api/v1"
];

function normalizeServicePath(rawPathPart: string): string {
  const trimmed = rawPathPart.replace(/^\/+|\/+$/g, "");
  return trimmed.replace(/^(services\/)?(v1\/)?/i, "");
}

async function proxyToServices(request: NextRequest, path: string[]): Promise<NextResponse> {
  const query = request.nextUrl.search ?? "";
  const rawPathPart = path.join("/");
  const normalizedPathPart = normalizeServicePath(rawPathPart);
  const pathPart = normalizedPathPart.endsWith("/") ? normalizedPathPart : `${normalizedPathPart}/`;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const authorizationHeader = request.headers.get("authorization");
  const requestId = request.headers.get("x-request-id") ?? createRequestId();
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : Buffer.from(await request.arrayBuffer());

  let lastError: unknown = null;
  const candidates = request.method === "GET" || request.method === "HEAD" ? CANDIDATES : [CANDIDATES[0]];

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

      const status = response.status;
      const shouldUseEmptyBody =
        request.method === "HEAD" ||
        status === 204 ||
        status === 205 ||
        status === 304;
      const text = shouldUseEmptyBody ? "" : await response.text();
      const proxiedResponse = new NextResponse(shouldUseEmptyBody ? null : text, {
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

  const message = lastError instanceof Error ? lastError.message : "Services proxy failed.";
  return NextResponse.json(
    { detail: message, request_id: requestId },
    { status: 502, headers: { "x-request-id": requestId } }
  );
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToServices(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToServices(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToServices(request, path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToServices(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToServices(request, path);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToServices(request, path);
}
