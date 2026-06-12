"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminRegistrationsPanel } from "../../dashboard/admin-registrations-panel";
import { DEFAULT_API_BASE, readAuth } from "../../client-api";
import type { AuthUser } from "../../client-api-types";
import { useLabels, useLanguage } from "../../use-labels";
import { AppShell } from "../../../components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";

type AuthState = {
  token: string;
  user: AuthUser;
} | null;

export default function AdminUsersPage() {
  const router = useRouter();
  const t = useLabels();
  const lang = useLanguage();
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE, []);
  const [auth, setAuth] = useState<AuthState | undefined>(undefined);

  useEffect(() => {
    const syncAuth = () => {
      setAuth(readAuth());
    };

    syncAuth();
    window.addEventListener("focus", syncAuth);
    document.addEventListener("visibilitychange", syncAuth);

    return () => {
      window.removeEventListener("focus", syncAuth);
      document.removeEventListener("visibilitychange", syncAuth);
    };
  }, []);

  useEffect(() => {
    if (auth === null) {
      router.replace("/login");
    }
  }, [auth, router]);

  const isAllowed = auth?.user.role === "admin" && auth.user.status === "approved";

  return (
    <AppShell title="Admin users" subtitle="Manage user approvals and roles.">
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Administration
          </p>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Admin users</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Manage user approvals and roles.
            </p>
          </div>
        </header>

        {auth === undefined ? (
        <Card className="wh-section-card border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Admin users</CardTitle>
            <CardDescription>{t.loading}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {auth === null ? (
        <Card className="wh-section-card border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Admin users</CardTitle>
            <CardDescription>{t.redirecting}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {auth && !isAllowed ? (
        <Card className="wh-section-card border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Access denied</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This page is available only to approved admin accounts.
          </CardContent>
        </Card>
      ) : null}

      {auth && isAllowed ? (
        <AdminRegistrationsPanel
          apiBase={apiBase}
          token={auth.token}
          role={auth.user.role}
          status={auth.user.status}
          lang={lang}
          currentUserId={auth.user.id}
        />
      ) : null}
      </div>
    </AppShell>
  );
}
