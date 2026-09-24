"use client";

import { useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Props = {
  value: Record<string, unknown>;
  onChange: (value: Record<string, string[]>) => void;
};

export function ProductEditorEbaySpecifics({ value, onChange }: Props) {
  const [newName, setNewName] = useState("");
  const specifics = Object.fromEntries(
    Object.entries(value).map(([name, values]) => [name, Array.isArray(values) ? values.map(String) : []]),
  ) as Record<string, string[]>;
  const hasEmptyValue = Object.values(specifics).some((values) => !values.length || values.some((entry) => !entry.trim()));

  function updateValues(name: string, values: string[]) {
    onChange({ ...specifics, [name]: values });
  }

  function addSpecific() {
    const name = newName.trim();
    if (!name || Object.keys(specifics).some((existing) => existing.toLowerCase() === name.toLowerCase())) return;
    onChange({ ...specifics, [name]: [""] });
    setNewName("");
  }

  return (
    <section className="space-y-3" aria-label="Item specifics">
      <div>
        <h3 className="text-sm font-semibold">Item specifics</h3>
        <p className="text-xs text-muted-foreground">Edit each value separately. Keep all required specifics when updating the listing.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(specifics).map(([name, values]) => (
          <div key={name} className="min-w-0 space-y-2 rounded-[var(--radius-control)] border border-border/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="min-w-0 break-words text-sm font-medium">{name}</h4>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${name}`} onClick={() => {
                const next = { ...specifics };
                delete next[name];
                onChange(next);
              }}>Remove</Button>
            </div>
            {values.map((entry, index) => (
              <div key={index} className="flex min-w-0 gap-2">
                <Input aria-label={`${name} value ${index + 1}`} value={entry} onChange={(event) => {
                  const next = [...values];
                  next[index] = event.target.value;
                  updateValues(name, next);
                }} />
                {values.length > 1 ? <Button type="button" variant="outline" size="sm" aria-label={`Remove ${name} value ${index + 1}`} onClick={() => updateValues(name, values.filter((_, valueIndex) => valueIndex !== index))}>−</Button> : null}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => updateValues(name, [...values, ""])}>Add value</Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-[200px] flex-1" aria-label="New item specific name" placeholder="New attribute name" value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addSpecific();
          }
        }} />
        <Button type="button" variant="outline" disabled={!newName.trim() || Object.keys(specifics).some((name) => name.toLowerCase() === newName.trim().toLowerCase())} onClick={addSpecific}>Add attribute</Button>
      </div>
      {hasEmptyValue ? <p className="text-xs text-amber-700">Fill or remove empty values before applying changes.</p> : null}
    </section>
  );
}
