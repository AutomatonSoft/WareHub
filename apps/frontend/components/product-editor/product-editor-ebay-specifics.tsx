"use client";

import { useEffect, useId, useRef, useState } from "react";

import { fetchEbayCategoryAspects } from "../../app/create-product/ebay-category-aspects";
import type { EbayCategoryAspect } from "../../app/create-product/create-product-model";
import { apiFetch } from "../../lib/api/client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Props = {
  value: Record<string, unknown>;
  onChange: (value: Record<string, string[]>) => void;
  onGenerated?: (value: Record<string, string[]>, seo: { title: string; subtitle: string; description: string }) => void;
  categoryId?: string;
  title?: string;
  sourceTitle?: string;
  sourceDescription?: string;
  sourceFacts?: Record<string, string>;
};

export function ProductEditorEbaySpecifics({ value, onChange, onGenerated, categoryId, title = "Item specifics", sourceTitle = "", sourceDescription = "", sourceFacts = {} }: Props) {
  const [newName, setNewName] = useState("");
  const [categoryAspects, setCategoryAspects] = useState<EbayCategoryAspect[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const listPrefix = useId();
  const currentSource = useRef({ categoryId, sourceTitle, sourceDescription });
  currentSource.current = { categoryId, sourceTitle, sourceDescription };

  useEffect(() => {
    if (!categoryId) {
      setCategoryAspects([]);
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setCategoryAspects([]);
    setError("");
    setLoading(true);
    void fetchEbayCategoryAspects(categoryId).then((aspects) => {
      if (!cancelled) setCategoryAspects(aspects);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Category attributes could not be loaded.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [categoryId]);

  const specifics = Object.fromEntries(
    Object.entries(value).map(([name, values]) => [name, Array.isArray(values) ? values.map(String) : []]),
  ) as Record<string, string[]>;
  const currentSpecifics = useRef(specifics);
  currentSpecifics.current = specifics;
  const requiredNames = new Set(categoryAspects.flatMap((aspect) => {
    const name = aspect.localizedAspectName?.trim();
    return aspect.aspectConstraint?.aspectRequired && name ? [name] : [];
  }));
  const displayed = Object.fromEntries([
    ...Array.from(requiredNames, (name) => [name, specifics[name] ?? [""]] as const),
    ...Object.entries(specifics).filter(([name]) => !requiredNames.has(name)),
  ]);
  const hasEmptyValue = Object.values(displayed).some((values) => !values.length || values.some((entry) => !entry.trim()));
  const knownNames = categoryAspects.map((aspect) => aspect.localizedAspectName?.trim()).filter((name): name is string => Boolean(name));
  const availableNames = knownNames.filter((name) => !Object.keys(displayed).some((existing) => existing.toLowerCase() === name.toLowerCase()));

  function updateValues(name: string, values: string[]) {
    onChange({ ...specifics, [name]: values });
  }

  function addSpecific(name: string) {
    name = name.trim();
    if (!name || Object.keys(displayed).some((existing) => existing.toLowerCase() === name.toLowerCase())) return;
    onChange({ ...specifics, [knownNames.find((known) => known.toLowerCase() === name.toLowerCase()) ?? name]: [""] });
    setNewName("");
  }

  async function fillWithOpenAI() {
    if (!categoryId || suggesting) return;
    const requestedCategory = categoryId;
    setSuggesting(true);
    setSuggestionMessage("");
    try {
      const response = await apiFetch("/api/v1/ebay/taxonomy/attribute-suggestions/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: requestedCategory, title: sourceTitle, description: sourceDescription, facts: sourceFacts }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const detail = payload && typeof payload === "object" && "detail" in payload ? String(payload.detail) : `HTTP ${response.status}`;
        throw new Error(detail);
      }
      if (currentSource.current.categoryId !== requestedCategory || currentSource.current.sourceTitle !== sourceTitle || currentSource.current.sourceDescription !== sourceDescription) return;
      const suggestions = payload && typeof payload === "object" && "suggestions" in payload && Array.isArray(payload.suggestions) ? payload.suggestions as Array<{ name: string; value: string }> : [];
      const rawSeo = payload && typeof payload === "object" && "seo" in payload && payload.seo && typeof payload.seo === "object" ? payload.seo as Record<string, unknown> : {};
      const seo = {
        title: typeof rawSeo.title === "string" ? rawSeo.title : "",
        subtitle: typeof rawSeo.subtitle === "string" ? rawSeo.subtitle : "",
        description: typeof rawSeo.description === "string" ? rawSeo.description : "",
      };
      const next = { ...currentSpecifics.current };
      let added = 0;
      for (const suggestion of suggestions) {
        if (typeof suggestion.name !== "string" || typeof suggestion.value !== "string") continue;
        if (next[suggestion.name]?.some((entry) => entry.trim())) continue;
        next[suggestion.name] = [suggestion.value];
        added += 1;
      }
      if (onGenerated) onGenerated(next, seo);
      else if (added) onChange(next);
      setSuggestionMessage(added || Object.values(seo).some(Boolean) ? `Generated ${added} attributes and SEO suggestions. Review every value before publishing.` : "No reliable suggestions were found. Fill the fields manually.");
    } catch (cause) {
      setSuggestionMessage(cause instanceof Error ? cause.message : "Attribute suggestions failed.");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <section className="space-y-3" aria-label={title}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{categoryId ? "Required attributes appear automatically for the selected category. Add other attributes below." : "Edit each value separately. Keep all required specifics when updating the listing."}</p>
      </div>
      {loading ? <p className="text-xs text-muted-foreground">Loading category attributes…</p> : null}
      {error ? <p className="text-xs text-destructive">eBay taxonomy: {error}</p> : null}
      {!categoryId && title !== "Item specifics" ? <p className="text-xs text-muted-foreground">Select a primary category to load required attributes.</p> : null}
      {categoryId && !loading && !error && requiredNames.size === 0 ? <p className="text-xs text-muted-foreground">eBay returned no required attributes for this primary category{categoryAspects.length ? ` (${categoryAspects.length} optional attributes available)` : ""}. Choose a more specific category if needed, or add attributes manually.</p> : null}
      {categoryId ? <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" disabled={suggesting || loading || !(sourceTitle.trim() || sourceDescription.trim())} onClick={() => void fillWithOpenAI()}>{suggesting ? "Generating suggestions…" : "Generate eBay attributes and SEO with OpenAI"}</Button><span className="text-xs text-muted-foreground">Sends product text and supplied facts to OpenAI. Existing attribute values remain unchanged; generated SEO text replaces title, subtitle and listing description. Review before publishing; eBay may charge for a subtitle.</span></div> : null}
      {suggestionMessage ? <p className="text-xs" role="status">{suggestionMessage}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(displayed).map(([name, values]) => {
          const aspect = categoryAspects.find((candidate) => candidate.localizedAspectName?.trim() === name);
          const options = (aspect?.aspectValues ?? []).map((candidate) => candidate.localizedValue).filter((candidate): candidate is string => Boolean(candidate));
          const multi = aspect?.aspectConstraint?.itemToAspectCardinality !== "SINGLE";
          const listId = `${listPrefix}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
          return (
            <div key={name} className="min-w-0 space-y-2 rounded-[var(--radius-control)] border border-border/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="min-w-0 break-words text-sm font-medium">{name}{requiredNames.has(name) ? <span className="text-destructive"> *</span> : null}</h4>
                {!requiredNames.has(name) ? <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${name}`} onClick={() => {
                  const next = { ...specifics };
                  delete next[name];
                  onChange(next);
                }}>Remove</Button> : null}
              </div>
              {values.map((entry, index) => (
                <div key={index} className="flex min-w-0 gap-2">
                  <Input aria-label={`${name} value ${index + 1}`} value={entry} list={options.length ? listId : undefined} aria-required={requiredNames.has(name)} onChange={(event) => {
                    const next = [...values];
                    next[index] = event.target.value;
                    updateValues(name, next);
                  }} />
                  {values.length > 1 ? <Button type="button" variant="outline" size="sm" aria-label={`Remove ${name} value ${index + 1}`} onClick={() => updateValues(name, values.filter((_, valueIndex) => valueIndex !== index))}>−</Button> : null}
                </div>
              ))}
              {options.length ? <datalist id={listId}>{options.map((option) => <option key={option} value={option} />)}</datalist> : null}
              {multi ? <Button type="button" variant="outline" size="sm" onClick={() => updateValues(name, [...values, ""])}>Add value</Button> : null}
            </div>
          );
        })}
      </div>
      {availableNames.length ? <select className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" aria-label="Add suggested category attribute" value="" onChange={(event) => addSpecific(event.target.value)}>
        <option value="">Choose an available category attribute…</option>
        {availableNames.map((name) => <option key={name} value={name}>{name}</option>)}
      </select> : null}
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-[200px] flex-1" aria-label="New item specific name" placeholder="New attribute name" list={`${listPrefix}-available`} value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addSpecific(newName);
          }
        }} />
        <datalist id={`${listPrefix}-available`}>{availableNames.map((name) => <option key={name} value={name} />)}</datalist>
        <Button type="button" variant="outline" disabled={!newName.trim() || Object.keys(displayed).some((name) => name.toLowerCase() === newName.trim().toLowerCase())} onClick={() => addSpecific(newName)}>Add attribute</Button>
      </div>
      <p className="text-xs text-muted-foreground">To add a custom attribute, enter its name and click Add attribute.</p>
      {hasEmptyValue ? <p className="text-xs text-amber-700">Fill required and added attributes before applying changes.</p> : null}
    </section>
  );
}
