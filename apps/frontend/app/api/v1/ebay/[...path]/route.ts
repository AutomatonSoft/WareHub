import { NextRequest, NextResponse } from "next/server";

const SERVICES_ORIGIN = process.env.SERVICES_ORIGIN ?? "http://localhost:8934";

function buildTargetUrl(request: NextRequest, path: string[]): string {
  const joined = path.join("/");
  const normalizedPath = joined.endsWith("/") ? joined : `${joined}/`;
  const search = request.nextUrl.search || "";
  return `${SERVICES_ORIGIN}/api/v1/ebay/${normalizedPath}${search}`;
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

  let response: Response;
  try {
    response = await fetch(targetUrl, init);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Services request failed.";
    return NextResponse.json(
      {
        code: "services_unavailable",
        detail: `Database service is not reachable: ${detail}`
      },
      { status: 503 }
    );
  }
  return new NextResponse(response.body, {
    status: response.status,
    headers: new Headers(response.headers)
  });
}

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path || []);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;
