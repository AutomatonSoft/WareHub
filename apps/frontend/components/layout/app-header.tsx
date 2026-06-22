"use client";

import { useEffect } from "react";
import { Menu } from "lucide-react";
import type { AuthUser } from "../../app/client-api-types";
import { applyStoredUiDensity } from "../../app/ui-density";
import { Button } from "../ui/button";

export function AppHeader({
  pageTitle,
  subtitle,
  onMenuOpen
}: {
  pageTitle: string;
  subtitle: string;
  currentUser: AuthUser | null;
  onMenuOpen: () => void;
  onUserCleared: () => void;
}) {
  useEffect(() => {
    applyStoredUiDensity();
  }, []);

  return (
    <header className="wh-app-header">
      <div className="wh-app-header__inner">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Open navigation"
          onClick={onMenuOpen}
          className="wh-header-control xl:hidden"
        >
          <Menu size={18} aria-hidden="true" />
        </Button>
        <div className="wh-app-header__title-group">
          <h1 className="wh-app-header__title">{pageTitle}</h1>
          <p className="wh-app-header__subtitle">{subtitle}</p>
        </div>
      </div>
    </header>
  );
}
