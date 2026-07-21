"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

type SearchablePickerProps = {
  id?: string;
  value: string;
  options: string[];
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  invalid?: boolean;
  invalidLabel?: string;
  maxLength?: number;
  normalizeValue?: (value: string) => string;
  createLabel?: string;
  canCreate?: boolean;
  onCreateOption?: (value: string) => void;
  onValueChange: (value: string) => void;
};

export function SearchablePicker({
  id,
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  invalid = false,
  invalidLabel,
  maxLength,
  normalizeValue,
  createLabel,
  canCreate = false,
  onCreateOption,
  onValueChange,
}: SearchablePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const normalizedQuery = String(value || "").trim().toUpperCase();

  const filteredOptions = useMemo(
    () =>
      options.filter((option) => {
        if (!normalizedQuery) return true;
        return option.toUpperCase().includes(normalizedQuery);
      }),
    [normalizedQuery, options]
  );
  const normalizedOptions = useMemo(
    () => new Set(options.map((option) => option.trim().toUpperCase()).filter(Boolean)),
    [options]
  );
  const trimmedValue = String(value || "").trim();
  const showCreateAction =
    canCreate &&
    !invalid &&
    trimmedValue.length > 0 &&
    !normalizedOptions.has(trimmedValue.toUpperCase()) &&
    typeof onCreateOption === "function";

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        id={id}
        type="button"
        className="flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm text-foreground shadow-sm transition-colors hover:border-primary/30"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn("min-w-0 truncate text-left", value ? "text-foreground" : "text-muted-foreground")}>
          {value || ""}
        </span>
        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-0 max-w-full overflow-hidden rounded-[var(--radius-card)] border border-slate-200 bg-white p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.28)]">
          <Input
            className="h-9 w-full min-w-0 rounded-[var(--radius-control)]"
            value={value}
            maxLength={maxLength}
            onChange={(event) => onValueChange(normalizeValue ? normalizeValue(event.target.value) : event.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
          />
          <div className="mt-2 max-h-56 overflow-x-hidden overflow-y-auto">
            {invalid ? (
              <p className="min-w-0 px-2 py-2 text-sm text-destructive">{invalidLabel || emptyLabel}</p>
            ) : (
              <div className="space-y-1">
                {showCreateAction ? (
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-center rounded-[var(--radius-control)] border border-dashed border-emerald-300 bg-emerald-50/60 px-2 py-2 text-left text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100/70"
                    onClick={() => {
                      onCreateOption?.(trimmedValue);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 truncate">{createLabel || trimmedValue}</span>
                  </button>
                ) : null}

                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={cn(
                        "flex w-full min-w-0 items-center rounded-[var(--radius-control)] px-2 py-2 text-left text-sm transition-colors hover:bg-slate-100",
                        value === option ? "bg-slate-100 text-foreground" : "text-slate-700"
                      )}
                      onClick={() => {
                        onValueChange(option);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0 truncate">{option}</span>
                    </button>
                  ))
                ) : !showCreateAction ? (
                  <p className="min-w-0 px-2 py-2 text-sm text-muted-foreground">{emptyLabel}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
