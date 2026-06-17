"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronDown, Download, LogOut, User, UserCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clearAuth, DEFAULT_API_BASE, logout, readAuth, resolvePhotoUrl } from "../../app/client-api";
import type { AuthUser } from "../../app/client-api-types";
import { resolveMobileApkUrlFromEnv } from "../../app/mobile-apk-url";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";

export function AppUserMenu({
  currentUser,
  collapsed = false,
  className,
  onUserCleared
}: {
  currentUser: AuthUser | null;
  collapsed?: boolean;
  className?: string;
  onUserCleared: () => void;
}) {
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE;
  const mobileApkUrl = resolveMobileApkUrlFromEnv();
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [currentUser?.avatar_url]);

  const displayName = useMemo(() => {
    if (currentUser?.username && currentUser.username.trim().length > 0) return currentUser.username;
    if (currentUser?.login && currentUser.login.trim().length > 0) return `@${currentUser.login}`;
    return "";
  }, [currentUser]);

  if (!currentUser) return null;

  const avatarLetter = (currentUser.username ?? currentUser.login ?? "U").slice(0, 1).toUpperCase();
  const avatarSrc = !currentUser.avatar_url || avatarLoadError ? null : resolvePhotoUrl(apiBase, currentUser.avatar_url);

  async function handleLogout() {
    const auth = readAuth();
    if (auth?.token) await logout(apiBase, auth.token).catch(() => null);
    clearAuth();
    onUserCleared();
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <Button
          type="button"
          variant="outline"
          size="lg"
          aria-label="User actions"
          className={cn("wh-header-control w-full px-3", collapsed ? "justify-center" : "justify-between", className)}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            {avatarSrc ? (
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted">
                <Image
                  src={avatarSrc}
                  alt="User avatar"
                  width={28}
                  height={28}
                  unoptimized
                  className="h-full w-full object-cover"
                  onError={() => setAvatarLoadError(true)}
                />
              </span>
            ) : (
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted text-[11px] font-semibold text-primary">
                {avatarLetter || <UserCircle2 size={16} aria-hidden="true" />}
              </span>
            )}
            {!collapsed ? <span className="max-w-[148px] truncate text-sm text-muted-foreground">{displayName}</span> : null}
          </span>
          {!collapsed ? <ChevronDown size={14} className="text-muted-foreground" aria-hidden="true" /> : null}
        </Button>
      } />
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-[228px] min-w-[228px] rounded-xl border border-border bg-[var(--wh-color-surface)] p-1.5 opacity-100 shadow-[var(--wh-shadow-popover)]"
      >
        <DropdownMenuItem className="h-9 gap-2 px-3 text-sm" onClick={() => router.push("/profile")}>
          <User size={15} aria-hidden="true" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          className="h-9 gap-2 px-3 text-sm"
          onClick={() => window.open(mobileApkUrl, "_blank", "noopener,noreferrer")}
        >
          <Download size={15} aria-hidden="true" />
          Download APP
        </DropdownMenuItem>
        <DropdownMenuItem className="h-9 gap-2 px-3 text-sm" onClick={() => router.push("/docs/api")}>
          <BookOpen size={15} aria-hidden="true" />
          API Docs
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-9 gap-2 px-3 text-sm" variant="destructive" onClick={() => void handleLogout()}>
          <LogOut size={15} aria-hidden="true" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
