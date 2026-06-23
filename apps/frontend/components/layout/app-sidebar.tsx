"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { AuthUser } from "../../app/client-api-types";
import { writeStoredLang } from "../../app/i18n";
import { useLanguage } from "../../app/use-labels";
import { useLabels } from "../../app/use-labels";
import { adminNavigationItem, navigationItems } from "../../lib/navigation";
import { cn } from "../../lib/cn";
import { Button, buttonVariants } from "../ui/button";
import { AppUserMenu } from "./app-user-menu";

export function AppSidebar({
  className,
  collapsed,
  currentUser,
  onToggleCollapsed,
  onUserCleared
}: {
  className?: string;
  collapsed: boolean;
  currentUser: AuthUser | null;
  onToggleCollapsed: () => void;
  onUserCleared: () => void;
}) {
  const t = useLabels();
  const lang = useLanguage();
  const pathname = usePathname();
  const visibleNavigationItems = useMemo(() => {
    if (currentUser?.role === "admin") {
      return [...navigationItems, adminNavigationItem];
    }
    return navigationItems;
  }, [currentUser?.role]);
  return (
    <aside className={cn("wh-sidebar sticky top-0 flex h-screen flex-col !pb-1 text-[var(--wh-color-text)]", className)}>
      <div className={cn("mb-5 flex items-center px-2", collapsed ? "justify-center" : "justify-between")}>
        <div className="wh-sidebar__brand flex items-center gap-3">
          <div className="wh-sidebar__brand-icon flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm">
            <Image src="/brand/logo.png" alt="WareHub logo" width={40} height={40} className="h-[40px] w-[40px] object-contain" priority />
          </div>
          {!collapsed ? (
            <div>
              <p className="wh-sidebar__brand-title text-[24px] font-semibold leading-none tracking-[-0.03em]">{t.brandName}</p>
            </div>
          ) : null}
        </div>
        {!collapsed ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            className="h-8 w-8 rounded-lg text-[color:var(--text-secondary)]"
          >
            <ChevronsLeft size={16} />
          </Button>
        ) : null}
      </div>
      {collapsed ? (
        <div className="mb-4 flex justify-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onToggleCollapsed}
            aria-label="Expand sidebar"
            className="h-8 w-8 rounded-lg text-[color:var(--text-secondary)]"
          >
            <ChevronsRight size={16} />
          </Button>
        </div>
      ) : null}

      <nav className="wh-sidebar__nav flex flex-1 flex-col gap-2 !pb-0">
        {visibleNavigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "wh-sidebar__nav-item h-[42px] rounded-xl text-[13px] font-medium",
                collapsed ? "justify-center px-2" : "justify-start gap-2.5 px-3",
                isActive
                  ? "wh-sidebar__nav-item--active"
                  : ""
              )}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={16} className={cn(isActive ? "text-sidebar-primary" : "text-current")} aria-hidden="true" />
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <div
          className={cn(
            "rounded-[var(--radius-card)] border border-border bg-card p-1.5 shadow-[var(--wh-shadow-card)]",
            collapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-1"
          )}
          aria-label="Language switcher"
        >
          {(["en", "ru", "de"] as const).map((code) => {
            const active = lang === code;
            return (
              <Button
                key={code}
                type="button"
                variant={active ? "default" : "ghost"}
                size="sm"
                onClick={() => writeStoredLang(code)}
                className={cn(
                  "h-8 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.06em] transition-colors duration-200",
                  collapsed ? "w-full" : "flex-1",
                  active
                    ? "pointer-events-none bg-[var(--wh-color-primary)] text-white shadow-none"
                    : "text-[color:var(--text-secondary)] hover:bg-muted hover:text-[color:var(--foreground)]"
                )}
                aria-pressed={active}
              >
                {code}
              </Button>
            );
          })}
        </div>
      </div>
      <AppUserMenu currentUser={currentUser} collapsed={collapsed} onUserCleared={onUserCleared} />
    </aside>
  );
}

