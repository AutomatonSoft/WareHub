"use client";

import { useEffect, useId, useState } from "react";

import { fetchEbayCategoryAspects } from "../../app/create-product/ebay-category-aspects";
import type { EbayCategoryAspect } from "../../app/create-product/create-product-model";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Props = {
  value: Record<string, unknown>;
  onChange: (value: Record<string, string[]>) => void;
  categoryId?: string;
  title?: string;
};

export function ProductEditorEbaySpecifics({ value, onChange, categoryId, title = "Item specifics" }: Props) {
  const [newName, setNewName] = useState("");
  const [categoryAspects, setCategoryAspects] = useState<EbayCategoryAspect[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const listPrefix = useId();

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

  function updateValues(name: string, values: string[]) {
    onChange({ ...specifics, [name]: values });
  }

  function addSpecific() {
    const name = newName.trim();
    if (!name || Object.keys(displayed).some((existing) => existing.toLowerCase() === name.toLowerCase())) return;
    onChange({ ...specifics, [knownNames.find((known) => known.toLowerCase() === name.toLowerCase()) ?? name]: [""] });
    setNewName("");
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
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-[200px] flex-1" aria-label="New item specific name" placeholder="New attribute name" list={`${listPrefix}-available`} value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addSpecific();
          }
        }} />
        <datalist id={`${listPrefix}-available`}>{knownNames.filter((name) => !Object.keys(displayed).some((existing) => existing.toLowerCase() === name.toLowerCase())).map((name) => <option key={name} value={name} />)}</datalist>
        <Button type="button" variant="outline" disabled={!newName.trim() || Object.keys(displayed).some((name) => name.toLowerCase() === newName.trim().toLowerCase())} onClick={addSpecific}>Add attribute</Button>
      </div>
      {hasEmptyValue ? <p className="text-xs text-amber-700">Fill required and added attributes before applying changes.</p> : null}
    </section>
  );
}
