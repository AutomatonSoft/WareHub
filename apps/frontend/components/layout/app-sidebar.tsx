"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { AuthUser } from "../../app/client-api-types";
import { useLabels } from "../../app/use-labels";
import { adminNavigationItem, navigationItems, telegramAdminNavigationItem } from "../../lib/navigation";
import { cn } from "../../lib/cn";
import { Button, buttonVariants } from "../ui/button";
import { GlobalLanguageSwitcher } from "../providers/global-language-switcher";
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
  const pathname = usePathname();
  const visibleNavigationItems = useMemo(() => {
    if (currentUser?.role === "admin") {
      return [...navigationItems, adminNavigationItem, telegramAdminNavigationItem];
    }
    return navigationItems;
  }, [currentUser?.role]);
  return (
    <aside className={cn("wh-sidebar sticky top-0 flex h-screen flex-col !pb-1 text-[var(--wh-color-text)]", className)}>
      <div className={cn("mb-4 flex items-center px-1.5", collapsed ? "justify-center" : "justify-between")}>
        <div className="wh-sidebar__brand flex items-center gap-3">
          <div className="wh-sidebar__brand-icon flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm">
            <Image src="/brand/logo.png" alt="WareHub logo" width={40} height={40} className="object-contain" priority />
          </div>
          {!collapsed ? (
            <div>
              <p className="wh-sidebar__brand-title text-[22px] font-semibold leading-none tracking-[-0.03em]">{t.brandName}</p>
            </div>
          ) : null}
        </div>
        {!collapsed ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onToggleCollapsed}
            aria-label={t.collapseSidebar}
            className="h-8 w-8 rounded-lg text-[color:var(--text-secondary)]"
          >
            <ChevronsLeft size={16} />
          </Button>
        ) : null}
      </div>
      {collapsed ? (
        <div className="mb-3 flex justify-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onToggleCollapsed}
            aria-label={t.expandSidebar}
            className="h-8 w-8 rounded-lg text-[color:var(--text-secondary)]"
          >
            <ChevronsRight size={16} />
          </Button>
        </div>
      ) : null}

      <nav className="wh-sidebar__nav flex flex-1 flex-col gap-1.5 !pb-0">
        {visibleNavigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "wh-sidebar__nav-item h-[38px] rounded-xl text-[13px] font-medium",
                collapsed ? "justify-center px-2" : "justify-start gap-2.5 px-3",
                isActive
                  ? "wh-sidebar__nav-item--active"
                  : ""
              )}
              title={collapsed ? t[item.labelKey] : undefined}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={16} className={cn(isActive ? "text-sidebar-primary" : "text-current")} aria-hidden="true" />
              {!collapsed ? <span>{t[item.labelKey]}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className={cn("wh-sidebar__footer", collapsed && "wh-sidebar__footer--collapsed")}>
        <GlobalLanguageSwitcher compact={collapsed} />
        <AppUserMenu currentUser={currentUser} collapsed={collapsed} onUserCleared={onUserCleared} />
      </div>
    </aside>
  );
}
