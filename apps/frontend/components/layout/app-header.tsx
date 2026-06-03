"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, UserCircle2 } from "lucide-react";
import { clearAuth, DEFAULT_API_BASE, logout, readAuth, resolvePhotoUrl } from "../../app/client-api";
import type { AuthUser } from "../../app/client-api-types";
import { writeStoredLang } from "../../app/i18n";
import { resolveMobileApkUrlFromEnv } from "../../app/mobile-apk-url";
import { applyStoredUiDensity } from "../../app/ui-density";
import { useLanguage } from "../../app/use-labels";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export function AppHeader({ pageTitle, subtitle }: { pageTitle: string; subtitle: string }) {
  const router = useRouter();
  const lang = useLanguage();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE;
  const mobileApkUrl = resolveMobileApkUrlFromEnv();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  useEffect(() => {
    applyStoredUiDensity();
  }, []);

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
    if (currentUser?.username && currentUser.username.trim().length > 0) {
      return currentUser.username;
    }
    if (currentUser?.login && currentUser.login.trim().length > 0) {
      return `@${currentUser.login}`;
    }
    return "";
  }, [currentUser]);

  const avatarSrc = !currentUser?.avatar_url || avatarLoadError
    ? null
    : resolvePhotoUrl(apiBase, currentUser.avatar_url);
  const resolvedTitle = pageTitle.trim().length > 0 ? pageTitle : "Create Product";
  const resolvedSubtitle = subtitle.trim().length > 0 ? subtitle : "Choose target sites and fill common product fields";

  async function handleLogout() {
    const auth = readAuth();
    if (auth?.token) {
      await logout(apiBase, auth.token).catch(() => null);
    }
    clearAuth();
    setCurrentUser(null);
    router.replace("/login");
  }

  return (
    <header className="wh-app-header">
      <div className="wh-app-header__inner">
        <div className="wh-app-header__title-group">
          <h2 className="wh-app-header__title">{resolvedTitle}</h2>
          <p className="wh-app-header__subtitle">{resolvedSubtitle}</p>
        </div>

        <div className="wh-app-header__actions">
          <Select value={lang} onValueChange={(value) => writeStoredLang(value as "en" | "ru" | "de")}>
            <SelectTrigger aria-label="Language" className="wh-header-control wh-select w-[92px] text-sm font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">EN</SelectItem>
              <SelectItem value="ru">RU</SelectItem>
              <SelectItem value="de">DE</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" className="wh-header-control w-10 px-0" aria-label="Notifications">
            <Bell size={16} />
          </Button>
          <div className="relative z-50">
            {currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    aria-label="User actions"
                    className="wh-header-control min-w-[152px] justify-between px-3"
                  >
                    {avatarSrc ? (
                      <Image
                        src={avatarSrc}
                        alt="User avatar"
                        width={24}
                        height={24}
                        unoptimized
                        className="h-6 w-6 rounded-full object-cover"
                        onError={() => setAvatarLoadError(true)}
                      />
                    ) : (
                      <UserCircle2 size={18} className="text-primary" />
                    )}
                    <span className="max-w-[148px] truncate text-sm text-muted-foreground">{displayName}</span>
                    <ChevronDown size={14} className="text-muted-foreground" />
                  </Button>
                } />
                <DropdownMenuContent align="end" sideOffset={6} className="min-w-[180px]">
                  <DropdownMenuItem
                    onClick={() => window.open(mobileApkUrl, "_blank", "noopener,noreferrer")}
                  >
                    Download APP
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/profile")}>Profile</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/docs/api")}>API Docs</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => void handleLogout()}>
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
