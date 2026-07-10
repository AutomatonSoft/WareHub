"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { AuthUser } from "../../client-api-types";
import { DEFAULT_API_BASE, readAuth } from "../../client-api";
import { useLabels } from "../../use-labels";
import { AppShell } from "../../../components/layout/app-shell";
import { SectionCard } from "../../../components/ui/section-card";
import { AdminTelegramAccessPanel } from "../../dashboard/admin-telegram-access-panel";

type AuthState = {
  token: string;
  user: AuthUser;
} | null;

export default function AdminTelegramAccessPage() {
  const router = useRouter();
  const t = useLabels();
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
    <AppShell title={t.telegramAccessTitle} subtitle={t.telegramAccessSubtitle}>
      <div className="space-y-4">
        {auth === undefined ? (
          <SectionCard title={t.telegramAccessTitle} subtitle={t.loading}>
            <div />
          </SectionCard>
        ) : null}

        {auth === null ? (
          <SectionCard title={t.telegramAccessTitle} subtitle={t.redirecting}>
            <div />
          </SectionCard>
        ) : null}

        {auth && !isAllowed ? (
          <SectionCard title={t.accessDeniedTitle} subtitle={t.accessDeniedTitle}>
            <p className="text-sm text-muted-foreground">{t.approvedAdminsOnly}</p>
          </SectionCard>
        ) : null}

        {auth && isAllowed ? (
          <AdminTelegramAccessPanel
            apiBase={process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE}
            token={auth.token}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
