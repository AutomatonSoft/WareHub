import { NextRequest, NextResponse } from "next/server";
import { createRequestId } from "../../../../../lib/api/request-id";

export const runtime = "nodejs";

const SERVICES_ORIGIN = process.env.SERVICES_ORIGIN ?? "http://localhost:8934";

async function proxyUpload(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.search ?? "";
  const requestId = request.headers.get("x-request-id") ?? createRequestId();
  const body = Buffer.from(await request.arrayBuffer());
  const response = await fetch(`${SERVICES_ORIGIN}/api/v1/uploads/images/${query}`, {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") ?? "multipart/form-data",
      cookie: request.headers.get("cookie") ?? "",
      "x-request-id": requestId
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
}

export async function POST(request: NextRequest) {
  return proxyUpload(request);
}
