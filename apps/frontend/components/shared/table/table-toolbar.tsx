"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "../input";
import { Toolbar, ToolbarGroup } from "@/components/ui/toolbar";

type TableToolbarProps = {
  scope: string;
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder: string;
  statusText?: string;
  filtersSlot?: ReactNode;
  debounceMs?: number;
};

export function TableToolbar({
  scope,
  query,
  onQueryChange,
  searchPlaceholder,
  statusText,
  filtersSlot,
  debounceMs = 250
}: TableToolbarProps) {
  const searchInputId = "table-search-input";
  const storageKey = useMemo(() => `sofortbot:table-query:${scope}`, [scope]);
  const [inputValue, setInputValue] = useState(query);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const hydratedFromStorageRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!hydratedFromStorageRef.current) {
      hydratedFromStorageRef.current = true;
      const persisted = window.localStorage.getItem(storageKey);
      if (persisted && !query) {
        setInputValue(persisted);
        onQueryChange(persisted);
        return;
      }
    }

    if (!isSearchFocused) {
      setInputValue(query);
    }
  }, [isSearchFocused, onQueryChange, query, storageKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onQueryChange(inputValue);
      if (typeof window !== "undefined") {
        if (inputValue.trim()) window.localStorage.setItem(storageKey, inputValue.trim());
        else window.localStorage.removeItem(storageKey);
      }
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [debounceMs, inputValue, onQueryChange, storageKey]);

  return (
    <Toolbar className="ui-table-toolbar ui-enter-fade-up">
      <ToolbarGroup className="ui-toolbar-group ui-toolbar-group-primary flex-1">
        <div className="relative min-w-0 flex-1 basis-[220px]">
          <label htmlFor={searchInputId} className="sr-only">Search in table</label>
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchInputId}
            aria-label="Search in table"
            className="ui-soft-pop h-10 bg-background !pl-12 !pr-10"
            placeholder={searchPlaceholder}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
          {inputValue ? (
            <button
              type="button"
              aria-label="Clear search"
              className="ui-icon-button ui-soft-pop absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[var(--radius-control)]"
              onClick={() => setInputValue("")}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </ToolbarGroup>

      {filtersSlot ? <ToolbarGroup className="ui-toolbar-group ui-toolbar-group-secondary">{filtersSlot}</ToolbarGroup> : null}

      {statusText ? (
        <p
          key={`toolbar-status-${statusText}`}
          aria-live="polite"
          className="ui-responsive-toolbar-status ui-change-flash text-sm font-medium text-muted-foreground"
        >
          {statusText}
        </p>
      ) : null}
    </Toolbar>
  );
}
