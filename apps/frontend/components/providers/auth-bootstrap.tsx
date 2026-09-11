"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { API_V1_ROUTES, buildApiV1Url } from "../../app/api-v1-routes";
import { bootstrapAuthSession, clearAuth, DEFAULT_API_BASE } from "../../app/client-api-shared";

function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/register" || pathname === "/forgot-password" || pathname === "/docs/api" || pathname === "/privacy";
}

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE, []);
  const [ready, setReady] = useState(() => isPublicPath(pathname));

  useEffect(() => {
    let active = true;

    async function ensureAuth() {
      if (isPublicPath(pathname)) {
        setReady(true);
        return;
      }

      setReady(false);
      const auth = await bootstrapAuthSession(apiBase);
      if (!active) {
        return;
      }
      if (!auth) {
        clearAuth();
        await fetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.logout), {
          method: "POST",
          credentials: "include"
        }).catch(() => null);
        if (!active) {
          return;
        }
        router.replace("/login");
        return;
      }
      setReady(true);
    }

    void ensureAuth();
    return () => {
      active = false;
    };
  }, [apiBase, pathname, router]);

  if (!ready) {
    return <div className="min-h-screen bg-background" aria-hidden="true" />;
  }

  return <>{children}</>;
}
