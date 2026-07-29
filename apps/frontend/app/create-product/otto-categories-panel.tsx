"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Switch } from "../../components/ui/switch";
import { cn } from "../../lib/utils";
import { fetchOttoCategories, type OttoCategory } from "./otto-categories-api";

type Props = {
  selectedCategory: string;
  onSelectedCategoryChange: (category: string) => void;
};

function normalizeCategoryValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function OttoCategoriesPanel({ selectedCategory, onSelectedCategoryChange }: Props) {
  const [categories, setCategories] = useState<OttoCategory[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const categoryRequest = useMemo(() => {
    const selectedCategoryIsId = /^\d+$/.test(selectedCategory);
    const searchQuery = showOnlySelected
      ? (selectedCategoryIsId ? "" : selectedCategory)
      : (debouncedQuery || (selectedCategoryIsId ? "" : selectedCategory));
    const selectedCategoryId = !searchQuery && selectedCategoryIsId ? selectedCategory : "";

    return { query: searchQuery, selectedCategoryId };
  }, [debouncedQuery, selectedCategory, showOnlySelected]);

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
          setError(requestError instanceof Error ? requestError.message : "Failed to load OTTO categories.");
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
    const normalizedSelectedCategory = normalizeCategoryValue(selectedCategory);
    if (!normalizedSelectedCategory) return;

    const matchingCategory = categories.find((category) =>
      category.id === selectedCategory ||
      normalizeCategoryValue(category.name) === normalizedSelectedCategory,
    );

    if (matchingCategory && matchingCategory.id !== selectedCategory) {
      onSelectedCategoryChange(matchingCategory.id);
    }
  }, [categories, onSelectedCategoryChange, selectedCategory]);

  const visibleCategories = useMemo(() => {
    const normalizedSelectedCategory = normalizeCategoryValue(selectedCategory);

    return categories.filter((category) => {
      const selected =
        category.id === selectedCategory ||
        normalizeCategoryValue(category.name) === normalizedSelectedCategory;
      return !showOnlySelected || selected;
    });
  }, [categories, selectedCategory, showOnlySelected]);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>CATEGORIES</CardTitle>
        <CardDescription>Select the category for this product.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Only selected</span>
          <Switch
            checked={showOnlySelected}
            onChange={(event) => setShowOnlySelected(event.target.checked)}
            aria-label="Show only selected category"
          />
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search categories"
          aria-label="Search OTTO categories"
        />
        {loading ? (
          <div className="flex flex-col gap-2" aria-label="Loading OTTO categories">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
        {!loading && !error && visibleCategories.length === 0 && (categoryRequest.query || categoryRequest.selectedCategoryId) ? (
          <div className="text-sm text-muted-foreground">No categories found.</div>
        ) : null}
        {!loading && !error && visibleCategories.length === 0 && !categoryRequest.query && !categoryRequest.selectedCategoryId ? (
          <div className="text-sm text-muted-foreground">Search for a category.</div>
        ) : null}
        {!loading && !error && visibleCategories.length > 0 ? (
          <div className="max-h-80 overflow-auto rounded-[var(--radius-control)] border border-border/70 bg-background p-1">
            <div className="flex flex-col gap-1">
              {visibleCategories.map((category) => {
                const selected =
                  selectedCategory === category.id ||
                  normalizeCategoryValue(category.name) === normalizeCategoryValue(selectedCategory);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => onSelectedCategoryChange(category.id)}
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
