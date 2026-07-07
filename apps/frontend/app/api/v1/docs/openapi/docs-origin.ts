export function resolveDocsOrigin(request: Request): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const forwardedPort = request.headers.get("x-forwarded-port")?.split(",")[0]?.trim();

  if (forwardedHost) {
    const protocol = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
    const defaultPort = protocol === "https" ? "443" : "80";
    const hasExplicitPort = forwardedHost.includes(":");
    const portSuffix =
      !hasExplicitPort && forwardedPort && forwardedPort !== defaultPort ? `:${forwardedPort}` : "";
    return `${protocol}://${forwardedHost}${portSuffix}`;
  }

  try {
    const url = new URL(request.url);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
    }
    if (url.hostname === "0.0.0.0") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
