import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const AUTH_COOKIE_KEY = "sofortbot_token";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") {
    return true;
  }
  if (pathname.startsWith("/api/")) {
    return true;
  }
  if (pathname.startsWith("/_next/")) {
    return true;
  }
  if (pathname.startsWith("/favicon.ico")) {
    return true;
  }
  if (pathname.startsWith("/uploads/")) {
    return true;
  }
  if (pathname.startsWith("/mobile/")) {
    return true;
  }
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    const token = request.cookies.get(AUTH_COOKIE_KEY)?.value;
    if (pathname === "/login" && token) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_KEY)?.value;
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*"
};

