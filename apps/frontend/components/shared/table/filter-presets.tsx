"use client";

import { useMemo, useState } from "react";
import { useLabels } from "@/app/use-labels";
import { Button } from "../button";
import { Input } from "../input";

type PresetRecord<T> = {
  id: string;
  name: string;
  data: T;
};

type FilterPresetsProps<T> = {
  scope: string;
  current: T;
  onApply: (value: T) => void;
  className?: string;
};

function loadPresets<T>(scope: string): PresetRecord<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(`filter-presets:${scope}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PresetRecord<T>[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePresets<T>(scope: string, presets: PresetRecord<T>[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(`filter-presets:${scope}`, JSON.stringify(presets));
}

export function FilterPresets<T>({ scope, current, onApply, className }: FilterPresetsProps<T>) {
  const t = useLabels();
  const [name, setName] = useState("");
  const [presets, setPresets] = useState<PresetRecord<T>[]>(() => loadPresets<T>(scope));
  const [selectedId, setSelectedId] = useState("");
  const [srStatus, setSrStatus] = useState("");

  const selected = useMemo(() => presets.find((item) => item.id === selectedId) ?? null, [presets, selectedId]);

  function handleSave() {
    const normalizedName = name.trim();
    if (!normalizedName) return;
    const next: PresetRecord<T>[] = [
      ...presets.filter((item) => item.name.toLowerCase() !== normalizedName.toLowerCase()),
      { id: `${Date.now()}-${Math.random()}`, name: normalizedName, data: current }
    ];
    setPresets(next);
    savePresets(scope, next);
    setName("");
    setSrStatus(t.presetSaved.replace("{name}", normalizedName));
  }

  function handleDelete() {
    if (!selected) return;
    const next = presets.filter((item) => item.id !== selected.id);
    setPresets(next);
    savePresets(scope, next);
    setSelectedId("");
    setSrStatus(t.presetDeleted);
  }

  function handleRename() {
    if (!selected) return;
    const normalizedName = name.trim();
    if (!normalizedName) return;
    const next = presets.map((item) => (item.id === selected.id ? { ...item, name: normalizedName } : item));
    setPresets(next);
    savePresets(scope, next);
    setName("");
    setSrStatus(t.presetRenamed.replace("{name}", normalizedName));
  }

  function handleClearAll() {
    setPresets([]);
    savePresets(scope, []);
    setSelectedId("");
    setSrStatus(t.allPresetsCleared);
  }

  return (
    <div className={className ?? "ui-enter-stagger flex w-full flex-wrap items-center gap-2"} role="group" aria-label={t.savedFilterPresets}>
      <Input
        aria-label={t.presetName}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t.presetName}
        className="h-9 w-full min-w-0 rounded-xl sm:w-[180px]"
      />
      <Button type="button" variant="secondary" className="ui-soft-pop h-9 rounded-xl px-3 text-xs" onClick={handleSave}>
        {t.savePreset}
      </Button>
      <select
        aria-label={t.choosePreset}
        className="ui-select focus-ring h-9 w-full min-w-0 rounded-xl px-3 text-sm sm:w-[190px]"
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
      >
        <option value="">{t.presets}</option>
        {presets.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="secondary"
        className="ui-soft-pop h-9 rounded-xl px-3 text-xs"
        disabled={!selected}
        onClick={() => {
          if (!selected) return;
          onApply(selected.data);
          setSrStatus(t.presetApplied.replace("{name}", selected.name));
        }}
      >
        {t.apply}
      </Button>
      <Button type="button" variant="secondary" className="ui-soft-pop h-9 rounded-xl px-3 text-xs" disabled={!selected || !name.trim()} onClick={handleRename}>
        {t.rename}
      </Button>
      <Button type="button" variant="secondary" className="ui-soft-pop h-9 rounded-xl px-3 text-xs" disabled={!selected} onClick={handleDelete}>
        {t.delete}
      </Button>
      <Button type="button" variant="ghost" className="ui-soft-pop h-9 rounded-xl px-2 text-xs" disabled={presets.length === 0} onClick={handleClearAll}>
        {t.clearAll}
      </Button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {srStatus}
      </span>
    </div>
  );
}
