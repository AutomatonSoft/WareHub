import { NextRequest, NextResponse } from "next/server";
import { createRequestId } from "../../../../lib/api/request-id";

export const runtime = "nodejs";

const CANDIDATES = [
  "http://127.0.0.1:8935/api/v1/orchestrator",
  "http://localhost:8935/api/v1/orchestrator",
  "http://sofortbot-orchestrator-dev:8011/api/v1/orchestrator"
];

async function proxyToOrchestrator(request: NextRequest, path: string[]): Promise<NextResponse> {
  const query = request.nextUrl.search ?? "";
  const pathPart = path.join("/");
  const cookieHeader = request.headers.get("cookie") ?? "";
  const requestId = request.headers.get("x-request-id") ?? createRequestId();
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : Buffer.from(await request.arrayBuffer());

  let lastError: unknown = null;

  for (const base of CANDIDATES) {
    const targetUrl = `${base}/${pathPart}${query}`;
    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          "content-type": request.headers.get("content-type") ?? "application/json",
          cookie: cookieHeader,
          ...(requestId ? { "x-request-id": requestId } : {})
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
