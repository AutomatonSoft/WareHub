"use client";

import React, { useEffect, useState } from "react";
import { AppFooter } from "./app-footer";
import { AppSidebar } from "./app-sidebar";

function applySidebarPreference(collapsed: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--wh-sidebar-width", collapsed ? "88px" : "260px");
  document.documentElement.setAttribute("data-wh-sidebar-collapsed", collapsed ? "1" : "0");
}

export function AppShell({
  title: _title,
  subtitle: _subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const collapsed = window.localStorage.getItem("wh:sidebar-collapsed") === "1";
    setSidebarCollapsed(collapsed);
    applySidebarPreference(collapsed);
    setHydrated(true);
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
        ? <AppSidebar className="hidden xl:flex" collapsed={sidebarCollapsed} onToggleCollapsed={handleSidebarToggle} />
        : <aside className="wh-sidebar hidden xl:flex" aria-hidden="true" />}
      <main className="wh-main">
        <div className="wh-page-content">
          <div className="wh-page-content__inner">
            {children}
            <AppFooter className="mt-auto" />
          </div>
        </div>
      </main>
    </div>
  );
}

