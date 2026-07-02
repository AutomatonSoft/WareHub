import { NextRequest, NextResponse } from "next/server";
import { createRequestId } from "../../../../../lib/api/request-id";

export const runtime = "nodejs";

const DEFAULT_CANDIDATES = [
  "http://127.0.0.1:8934",
  "http://localhost:8934"
];

const SERVICES_CANDIDATES = (() => {
  const configured = process.env.SERVICES_ORIGIN?.trim();
  if (!configured) {
    return DEFAULT_CANDIDATES;
  }
  return [configured, ...DEFAULT_CANDIDATES.filter((candidate) => candidate !== configured)];
})();

async function proxyUpload(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.search ?? "";
  const requestId = request.headers.get("x-request-id") ?? createRequestId();
  const cookieHeader = request.headers.get("cookie") ?? "";
  const authorizationHeader = request.headers.get("authorization");
  const body = Buffer.from(await request.arrayBuffer());

  let lastError: unknown = null;

  for (const base of SERVICES_CANDIDATES) {
    try {
      const headers: Record<string, string> = {
        "content-type": request.headers.get("content-type") ?? "multipart/form-data",
        cookie: cookieHeader,
        "x-request-id": requestId
      };
      if (authorizationHeader) {
        headers.authorization = authorizationHeader;
      }

      const response = await fetch(`${base}/api/v1/uploads/images/${query}`, {
        method: request.method,
        headers,
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

  const message = lastError instanceof Error ? lastError.message : "Uploads proxy failed.";
  return NextResponse.json(
    { detail: message, request_id: requestId },
    { status: 502, headers: { "x-request-id": requestId } }
  );
}

export async function POST(request: NextRequest) {
  return proxyUpload(request);
}
