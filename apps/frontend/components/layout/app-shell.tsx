"use client";

import React, { useEffect, useState } from "react";
import { readAuth } from "../../app/client-api";
import type { AuthUser } from "../../app/client-api-types";
import { AppSidebar } from "./app-sidebar";
import { MobileNavigation } from "./mobile-navigation";
import { PageShell } from "../ui/page-shell";

function applySidebarPreference(collapsed: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--wh-sidebar-width", collapsed ? "88px" : "260px");
  document.documentElement.setAttribute("data-wh-sidebar-collapsed", collapsed ? "1" : "0");
}

export function AppShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  void title;
  void subtitle;

  useEffect(() => {
    const collapsed = window.localStorage.getItem("wh:sidebar-collapsed") === "1";
    setSidebarCollapsed(collapsed);
    applySidebarPreference(collapsed);
    setHydrated(true);
  }, []);

  useEffect(() => {
    const syncUser = () => {
      const auth = readAuth();
      setCurrentUser(auth?.user ?? null);
    };

    syncUser();
    window.addEventListener("warehub-auth-change", syncUser);
    window.addEventListener("focus", syncUser);
    document.addEventListener("visibilitychange", syncUser);
    return () => {
      window.removeEventListener("warehub-auth-change", syncUser);
      window.removeEventListener("focus", syncUser);
      document.removeEventListener("visibilitychange", syncUser);
    };
  }, []);

  function handleSidebarToggle() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("wh:sidebar-collapsed", next ? "1" : "0");
      applySidebarPreference(next);
      return next;
    });
  }

  return (
    <div className="wh-app-shell min-h-screen overflow-x-clip bg-[var(--wh-color-page)] text-[var(--wh-color-text)]">
      {hydrated
        ? (
          <AppSidebar
            className="hidden xl:flex"
            collapsed={sidebarCollapsed}
            currentUser={currentUser}
            onToggleCollapsed={handleSidebarToggle}
            onUserCleared={() => setCurrentUser(null)}
          />
        )
        : <aside className="wh-sidebar hidden xl:flex" aria-hidden="true" />}
      <main className="wh-main">
        <div className="wh-page-content">
          <div className="wh-page-content__inner">
            <PageShell>
              {children}
            </PageShell>
          </div>
        </div>
      </main>
      <MobileNavigation
        currentUser={currentUser}
        open={mobileNavigationOpen}
        onOpenChange={setMobileNavigationOpen}
        onUserCleared={() => setCurrentUser(null)}
      />
    </div>
  );
}

