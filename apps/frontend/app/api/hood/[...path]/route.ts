import { NextRequest, NextResponse } from "next/server";

const SERVICES_ORIGIN = process.env.SERVICES_ORIGIN ?? "http://localhost:8934";

function buildTargetUrl(request: NextRequest, path: string[]): string {
  const joined = path.join("/");
  const normalizedPath = joined.endsWith("/") ? joined : `${joined}/`;
  const search = request.nextUrl.search || "";
  return `${SERVICES_ORIGIN}/api/hood/${normalizedPath}${search}`;
}

async function proxy(request: NextRequest, path: string[]) {
  const targetUrl = buildTargetUrl(request, path);
  const headers = new Headers(request.headers);
  headers.delete("host");
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : Buffer.from(await request.arrayBuffer());

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    body
  } as RequestInit;

  const response = await fetch(targetUrl, init);
  const responseHeaders = new Headers(response.headers);
  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path || []);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path || []);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path || []);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path || []);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path || []);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path || []);
}
