"use client";

import { MarketplaceFieldGroup, useMarketplaceField } from "../../components/product-forms/marketplace-form-feedback";

import { useEffect, useState } from "react";

import { fetchEbayCategoryNode, searchEbayCategorySuggestions, type EbayCategoryNode, type EbayCategorySuggestion } from "./ebay-category-api";

type Props = {
  label: string;
  value: string;
  onChange: (categoryId: string) => void;
  excludeCategoryId?: string;
  optional?: boolean;
};

export function EbayCategoryPicker({ label, value, onChange, excludeCategoryId, optional = false }: Props) {
  const feedback = useMarketplaceField(optional ? "secondary_category" : "category");
  const [selected, setSelected] = useState({ id: "", name: "" });
  const [expanded, setExpanded] = useState(!optional && !value);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<EbayCategorySuggestion[]>([]);
  const [tree, setTree] = useState<EbayCategoryNode | null>(null);
  const [path, setPath] = useState<EbayCategoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!value) return;
    if (selected.id === value) return;
    let cancelled = false;
    void fetchEbayCategoryNode(value).then((node) => {
      if (!cancelled) setSelected({ id: value, name: node.category_name || `Category ${value}` });
    }).catch(() => {
      if (!cancelled) setSelected({ id: value, name: `Category ${value} (name unavailable)` });
    });
    return () => { cancelled = true; };
  }, [selected.id, value]);

  function choose(categoryId: string, name: string) {
    if (!categoryId || categoryId === excludeCategoryId) return;
    feedback.clear();
    setSelected({ id: categoryId, name });
    setExpanded(false);
    setError("");
    onChange(categoryId);
  }

  async function chooseSuggestion(categoryId: string, name: string) {
    setLoading(true);
    setError("");
    try {
      const node = await fetchEbayCategoryNode(categoryId);
      if (!node.is_leaf) {
        setError("Choose a leaf category for the listing.");
        return;
      }
      choose(categoryId, name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Category could not be verified.");
    } finally { setLoading(false); }
  }

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      setSuggestions(await searchEbayCategorySuggestions(query.trim()));
    } catch (cause) {
      setSuggestions([]);
      setError(cause instanceof Error ? cause.message : "Category search failed.");
    } finally { setLoading(false); }
  }

  async function openTree(categoryId = "", nextPath: EbayCategoryNode[] = []) {
    setLoading(true);
    setError("");
    try {
      setTree(await fetchEbayCategoryNode(categoryId));
      setPath(nextPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Category tree could not be loaded.");
    } finally { setLoading(false); }
  }

  return <MarketplaceFieldGroup name={optional ? "secondary_category" : "category"} className="md:col-span-2"><div className="space-y-2 md:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {optional && value ? <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setSelected({ id: "", name: "" }); onChange(""); }}>Clear</button> : null}
        <button type="button" className="wh-button-secondary" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? "Close" : value ? "Change category" : "Choose category"}</button>
      </div>
    </div>
    <div className="rounded-[var(--radius-control)] border border-border/70 bg-muted/20 px-3 py-2 text-sm" role="status">
      {value ? selected.id === value ? selected.name : "Loading category name…" : optional ? "No secondary category selected" : "No category selected"}
    </div>
    {expanded ? <div className="space-y-3 rounded-[var(--radius-control)] border border-border/70 p-3">
      <div className="flex gap-2"><input className="wh-input h-10 min-w-0 flex-1 rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder="Search eBay categories" aria-label={`Search ${label.toLowerCase()}`} /><button type="button" className="wh-button-secondary" disabled={loading || !query.trim()} onClick={() => void search()}>Search</button></div>
      {suggestions.length ? <div className="max-h-48 overflow-auto rounded-[var(--radius-control)] border border-border/70 p-2">{suggestions.map((suggestion) => { const id = suggestion.category?.categoryId || ""; const name = suggestion.category?.categoryName || ""; const ancestors = (suggestion.categoryTreeNodeAncestors ?? []).map((node) => node.categoryName).filter(Boolean).join(" › "); return id && id !== excludeCategoryId ? <button key={id} type="button" disabled={loading} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary" onClick={() => void chooseSuggestion(id, [ancestors, name].filter(Boolean).join(" › "))}>{name}<span className="ml-2 text-xs text-muted-foreground">{ancestors}</span></button> : null; })}</div> : null}
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">Category tree</span><button type="button" className="wh-button-secondary" disabled={loading} onClick={() => void openTree()}>Start at root</button></div>
      {path.length ? <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">{path.map((node, index) => <button key={`${node.category_id}-${index}`} type="button" className="underline" onClick={() => void openTree(node.category_id, path.slice(0, index))}>{node.category_name}</button>)}</div> : null}
      {tree ? <div className="max-h-64 overflow-auto rounded-[var(--radius-control)] border border-border/70 p-2"><p className="px-2 py-1 text-xs text-muted-foreground">{tree.category_name || "Root"}</p>{(tree.children ?? []).map((node) => node.category_id !== excludeCategoryId ? <button key={node.category_id} type="button" className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary" onClick={() => node.is_leaf ? choose(node.category_id, [...path.map((item) => item.category_name), tree.category_name, node.category_name].filter(Boolean).join(" › ")) : void openTree(node.category_id, [...path, tree])}>{node.category_name}<span className="ml-2 text-xs text-muted-foreground">{node.is_leaf ? "Select" : "Open"}</span></button> : null)}</div> : null}
      {loading ? <p className="text-xs text-muted-foreground">Loading categories…</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div> : null}
  </div></MarketplaceFieldGroup>;
}
