"use client";

import { useEffect, useMemo, useState } from "react";

import { useLabels } from "../use-labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Progress, ProgressLabel, ProgressValue } from "../../components/ui/progress";
import { Skeleton } from "../../components/ui/skeleton";
import { Switch } from "../../components/ui/switch";
import { cn } from "../../lib/utils";
import {
  fetchOttoCategories,
  fetchOttoFullCacheSyncStatus,
  startOttoFullCacheSync,
  type OttoCategory,
  type OttoFullCacheSyncStatus,
} from "./otto-categories-api";

type Props = {
  selectedCategoryId: string;
  onSelectedCategoryChange: (category: OttoCategory) => void;
};

export function OttoCategoriesPanel({ selectedCategoryId, onSelectedCategoryChange }: Props) {
  const t = useLabels();
  const [categories, setCategories] = useState<OttoCategory[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<OttoFullCacheSyncStatus | null>(null);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const categoryRequest = useMemo(() => {
    const selectedCategoryIsId = /^\d+$/.test(selectedCategoryId);
    const searchQuery = showOnlySelected
      ? ""
      : debouncedQuery;
    const selectedId = !searchQuery && selectedCategoryIsId ? selectedCategoryId : "";

    return { query: searchQuery, selectedCategoryId: selectedId };
  }, [debouncedQuery, selectedCategoryId, showOnlySelected]);

  useEffect(() => {
    if (!categoryRequest.query && !categoryRequest.selectedCategoryId) {
      setCategories([]);
      setLoading(false);
      setError("");
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    void fetchOttoCategories(categoryRequest)
      .then((items) => {
        if (active) setCategories(items);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : t.ottoCategoriesLoadFailed);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [categoryRequest]);

  useEffect(() => {
    let active = true;
    void fetchOttoFullCacheSyncStatus()
      .then((status) => {
        if (active) setSyncStatus(status);
      })
      .catch(() => {
        // The category search still gives the user a useful UI if the job status is unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (syncStatus?.status !== "running") return;
    let active = true;
    const intervalId = window.setInterval(() => {
      void fetchOttoFullCacheSyncStatus()
        .then((status) => {
          if (active) setSyncStatus(status);
        })
        .catch((requestError) => {
          if (active) {
            setSyncError(requestError instanceof Error ? requestError.message : "Failed to load OTTO sync progress.");
          }
        });
    }, 1500);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [syncStatus?.status]);

  const visibleCategories = useMemo(() => {
    return categories.filter((category) => {
      const selected = category.id === selectedCategoryId;
      return !showOnlySelected || selected;
    });
  }, [categories, selectedCategoryId, showOnlySelected]);

  const startFullSync = () => {
    setSyncError("");
    void startOttoFullCacheSync()
      .then(setSyncStatus)
      .catch((requestError) => {
        setSyncError(requestError instanceof Error ? requestError.message : t.ottoCacheStartFailed);
      });
  };

  const syncIsRunning = syncStatus?.status === "running";
  const syncProgressText = syncStatus?.phase === "categories"
    ? t.ottoRefreshingCategories
    : t.ottoAttributesProgress
      .replace("{completed}", String(syncStatus?.completed ?? 0))
      .replace("{total}", String(syncStatus?.total ?? 0));

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t.ottoCategories}</CardTitle>
          <Button type="button" variant="outline" size="xs" onClick={startFullSync} disabled={syncIsRunning}>
            {syncIsRunning ? t.ottoSyncing : t.ottoGet}
          </Button>
        </div>
        <CardDescription>{t.ottoSelectCategoryHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {syncIsRunning ? (
          <Progress value={syncStatus.progressPercent} aria-label={t.ottoCacheSyncProgress}>
            <ProgressLabel>{syncProgressText}</ProgressLabel>
            <ProgressValue />
          </Progress>
        ) : null}
        {syncStatus?.status === "completed" ? (
          <div className="text-xs text-muted-foreground">
            {t.ottoCacheSyncSummary
              .replace("{cached}", String(syncStatus.cached))
              .replace("{failed}", syncStatus.failed ? `, ${syncStatus.failed}` : "")}
          </div>
        ) : null}
        {syncStatus?.status === "failed" ? <div className="text-sm text-destructive">{syncStatus.error}</div> : null}
        {syncError ? <div className="text-sm text-destructive">{syncError}</div> : null}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{t.ottoOnlySelected}</span>
          <Switch
            checked={showOnlySelected}
            onChange={(event) => setShowOnlySelected(event.target.checked)}
            aria-label={t.ottoOnlySelectedAria}
          />
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.ottoSearchCategories}
          aria-label={t.ottoSearchCategoriesAria}
        />
        {loading ? (
          <div className="flex flex-col gap-2" aria-label={t.ottoLoadingCategoriesAria}>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
        {!loading && !error && visibleCategories.length === 0 && (categoryRequest.query || categoryRequest.selectedCategoryId) ? (
          <div className="text-sm text-muted-foreground">{t.noCategoriesFound}</div>
        ) : null}
        {!loading && !error && visibleCategories.length === 0 && !categoryRequest.query && !categoryRequest.selectedCategoryId ? (
          <div className="text-sm text-muted-foreground">{t.ottoSearchCategoryHint}</div>
        ) : null}
        {!loading && !error && visibleCategories.length > 0 ? (
          <div className="max-h-80 overflow-auto rounded-[var(--radius-control)] border border-border/70 bg-background p-1">
            <div className="flex flex-col gap-1">
              {visibleCategories.map((category) => {
                const selected =
                  selectedCategoryId === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => onSelectedCategoryChange(category)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-9 items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm transition",
                      selected ? "bg-primary text-primary-foreground" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="truncate">{category.name}</span>
                    <span className="shrink-0 text-xs opacity-75">{category.id}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
