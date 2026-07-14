import { NextRequest, NextResponse } from "next/server";
import { resolveMobileApkUrlFromEnv } from "../../mobile-apk-url";

export function GET(request: NextRequest): NextResponse {
  const apkUrl = resolveMobileApkUrlFromEnv();
  return NextResponse.redirect(new URL(apkUrl, request.url), 307);
}
