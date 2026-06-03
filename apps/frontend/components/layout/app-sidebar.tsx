"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronDown, ChevronsLeft, ChevronsRight, Download, LogOut, User, UserCircle2 } from "lucide-react";
import { clearAuth, DEFAULT_API_BASE, logout, readAuth, resolvePhotoUrl } from "../../app/client-api";
import type { AuthUser } from "../../app/client-api-types";
import { writeStoredLang } from "../../app/i18n";
import { resolveMobileApkUrlFromEnv } from "../../app/mobile-apk-url";
import { useLanguage } from "../../app/use-labels";
import { useLabels } from "../../app/use-labels";
import { navigationItems } from "../../lib/navigation";
import { cn } from "../../lib/cn";
import { Button, buttonVariants } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";

export function AppSidebar({
  className,
  collapsed,
  onToggleCollapsed
}: {
  className?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const t = useLabels();
  const lang = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE;
  const mobileApkUrl = resolveMobileApkUrlFromEnv();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  useEffect(() => {
    const syncUser = () => {
      const auth = readAuth();
      setCurrentUser(auth?.user ?? null);
    };

    syncUser();
    window.addEventListener("focus", syncUser);
    document.addEventListener("visibilitychange", syncUser);
    return () => {
      window.removeEventListener("focus", syncUser);
      document.removeEventListener("visibilitychange", syncUser);
    };
  }, []);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [currentUser?.avatar_url]);

  const displayName = useMemo(() => {
    if (currentUser?.username && currentUser.username.trim().length > 0) return currentUser.username;
    if (currentUser?.login && currentUser.login.trim().length > 0) return `@${currentUser.login}`;
    return "";
  }, [currentUser]);
  const avatarLetter = (currentUser?.username ?? currentUser?.login ?? "U").slice(0, 1).toUpperCase();

  const avatarSrc = !currentUser?.avatar_url || avatarLoadError ? null : resolvePhotoUrl(apiBase, currentUser.avatar_url);

  async function handleLogout() {
    const auth = readAuth();
    if (auth?.token) await logout(apiBase, auth.token).catch(() => null);
    clearAuth();
    setCurrentUser(null);
    router.replace("/login");
  }

  return (
    <aside className={cn("wh-sidebar sticky top-0 flex h-screen flex-col !pb-1 text-[var(--wh-color-text)]", className)}>
      <div className={cn("mb-6 flex items-center px-2", collapsed ? "justify-center" : "justify-between")}>
        <div className="wh-sidebar__brand flex items-center gap-3">
          <div className="wh-sidebar__brand-icon flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm">
            <img src="/brand/logo.png" alt="WareHub logo" width={40} height={40} className="h-[40px] w-[40px] object-contain" />
          </div>
          {!collapsed ? (
            <div>
              <p className="wh-sidebar__brand-title text-[26px] font-semibold leading-none">{t.brandName}</p>
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
        {navigationItems.map((item) => {
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
            >
              <Icon size={16} className={cn(isActive ? "text-sidebar-primary" : "text-current")} />
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <div
          className={cn(
            "rounded-2xl border border-white/55 bg-[linear-gradient(145deg,rgba(255,255,255,0.86),rgba(247,252,250,0.68))] p-1.5 shadow-[0_18px_38px_-24px_rgba(15,23,42,0.55),inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-2xl dark:border-white/20 dark:bg-[linear-gradient(145deg,rgba(255,255,255,0.11),rgba(255,255,255,0.06))]",
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
                  "h-8 rounded-xl px-2 text-xs font-semibold uppercase tracking-[0.06em] transition-all duration-200",
                  collapsed ? "w-full" : "flex-1",
                  active
                    ? "pointer-events-none -translate-y-[1px] bg-[linear-gradient(135deg,#4b5563,#374151)] text-white shadow-[0_14px_28px_-16px_rgba(17,24,39,0.55)]"
                    : "text-[color:var(--text-secondary)] hover:bg-white/65 hover:text-[color:var(--foreground)] hover:shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)] dark:hover:bg-white/12"
                )}
                aria-pressed={active}
              >
                {code}
              </Button>
            );
          })}
        </div>
      </div>
      {currentUser ? (
        <div className="mb-0">
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button
                type="button"
                variant="outline"
                size="lg"
                aria-label="User actions"
                className={cn("wh-header-control w-full px-3", collapsed ? "justify-center" : "justify-between")}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  {avatarSrc ? (
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted">
                      <img
                        src={avatarSrc}
                        alt="User avatar"
                        width={28}
                        height={28}
                        className="h-full w-full object-cover"
                        loading="eager"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarLoadError(true)}
                      />
                    </span>
                  ) : (
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted text-[11px] font-semibold text-primary">
                      {avatarLetter}
                    </span>
                  )}
                  {!collapsed ? <span className="max-w-[148px] truncate text-sm text-muted-foreground">{displayName}</span> : null}
                </span>
                {!collapsed ? <ChevronDown size={14} className="text-muted-foreground" /> : null}
              </Button>
            } />
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="w-[228px] min-w-[228px] rounded-2xl !border-0 bg-[var(--wh-color-page)] p-1.5 opacity-100 shadow-[0_16px_34px_-20px_rgba(15,23,42,0.35)] !ring-0 !outline-none before:hidden"
            >
              <DropdownMenuItem className="h-9 gap-2 px-3 text-sm" onClick={() => router.push("/profile")}>
                <User size={15} />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="h-9 gap-2 px-3 text-sm"
                onClick={() => window.open(mobileApkUrl, "_blank", "noopener,noreferrer")}
              >
                <Download size={15} />
                Download APP
              </DropdownMenuItem>
              <DropdownMenuItem className="h-9 gap-2 px-3 text-sm" onClick={() => router.push("/docs/api")}>
                <BookOpen size={15} />
                API Docs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="h-9 gap-2 px-3 text-sm" variant="destructive" onClick={() => void handleLogout()}>
                <LogOut size={15} />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </aside>
  );
}

