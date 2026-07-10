"use client";

import { Languages } from "lucide-react";
import { writeStoredLang } from "../../app/i18n";
import { useLanguage, useLabels } from "../../app/use-labels";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";

const LANGUAGE_CODES = ["en", "ru", "de"] as const;

export function GlobalLanguageSwitcher({
  className,
  compact = false
}: {
  className?: string;
  compact?: boolean;
}) {
  const lang = useLanguage();
  const t = useLabels();

  return (
    <div className={cn("wh-language-switcher", compact && "wh-language-switcher--compact", className)} aria-label={t.languageSwitcherAria}>
      {!compact ? (
        <div className="flex items-center gap-1.5 px-0.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <Languages size={12} aria-hidden="true" />
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t.languages}</p>
        </div>
      ) : null}
      <div
        className={cn(
          "wh-language-switcher__panel",
          compact ? "grid-cols-1" : "grid-cols-3"
        )}
      >
        {LANGUAGE_CODES.map((code) => {
          const active = lang === code;

          return (
            <Button
              key={code}
              type="button"
              variant={active ? "default" : "ghost"}
              size="sm"
              onClick={() => writeStoredLang(code)}
              aria-pressed={active}
              title={t.languageTitle.replace("{lang}", code.toUpperCase())}
              className={cn(
                "wh-language-switcher__button",
                compact && "wh-language-switcher__button--compact",
                active
                  ? "wh-language-switcher__button--active pointer-events-none"
                  : "text-[color:var(--text-secondary)] hover:bg-muted hover:text-foreground"
              )}
            >
              {code}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
