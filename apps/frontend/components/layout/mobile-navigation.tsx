"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AuthUser } from "../../app/client-api-types";
import { useLabels } from "../../app/use-labels";
import { adminNavigationItem, navigationItems, telegramAdminNavigationItem } from "../../lib/navigation";
import { cn } from "../../lib/cn";
import { buttonVariants } from "../ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "../ui/sheet";
import { GlobalLanguageSwitcher } from "../providers/global-language-switcher";
import { AppUserMenu } from "./app-user-menu";

export function MobileNavigation({
  currentUser,
  open,
  onOpenChange,
  onUserCleared
}: {
  currentUser: AuthUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserCleared: () => void;
}) {
  const pathname = usePathname();
  const t = useLabels();
  const visibleNavigationItems = currentUser?.role === "admin"
    ? [...navigationItems, adminNavigationItem, telegramAdminNavigationItem]
    : navigationItems;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="wh-mobile-nav w-[min(88vw,360px)] border-r border-border bg-[var(--wh-color-surface)] p-0 xl:hidden">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="text-base font-semibold">{t.brandName}</SheetTitle>
          <SheetDescription>{t.mobileNavigationDescription}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <nav className="flex flex-col gap-1" aria-label={t.mobileNavigationAria}>
            {visibleNavigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "lg" }),
                    "wh-mobile-nav__item h-10 justify-start gap-2 rounded-lg px-3 text-sm",
                    isActive ? "wh-mobile-nav__item--active" : ""
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{t[item.labelKey]}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-3 border-t border-border pt-4">
            <GlobalLanguageSwitcher compact />
            <AppUserMenu currentUser={currentUser} onUserCleared={onUserCleared} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
