import { NextRequest, NextResponse } from "next/server";
import { createRequestId } from "../../../../../lib/api/request-id";
import { resolveServicesApiBaseCandidates } from "../../../../../lib/api/upstream-base";

export const runtime = "nodejs";

async function proxyUpload(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.search ?? "";
  const requestId = request.headers.get("x-request-id") ?? createRequestId();
  const cookieHeader = request.headers.get("cookie") ?? "";
  const authorizationHeader = request.headers.get("authorization");
  const body = Buffer.from(await request.arrayBuffer());

  let lastError: unknown = null;
  const servicesCandidates = resolveServicesApiBaseCandidates().map((base) => base.replace(/\/api\/v1$/i, ""));

  for (const base of servicesCandidates) {
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
