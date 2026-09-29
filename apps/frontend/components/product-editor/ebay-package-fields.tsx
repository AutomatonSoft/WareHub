"use client";

import { useState } from "react";

import { DeferredInput } from "../../app/create-product/deferred-form-fields";

type PackageData = Record<string, unknown>;
type Measurement = { value?: number; unit?: string };

type Props = {
  value: PackageData;
  onChange: (value: PackageData) => void;
};

const weightUnits = ["KILOGRAM", "GRAM", "POUND", "OUNCE"];
const dimensionUnits = ["CENTIMETER", "METER", "INCH", "FEET"];

function record(value: unknown): PackageData {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PackageData : {};
}

export function EbayPackageFields({ value, onChange }: Props) {
  const [error, setError] = useState("");
  const weight = record(value.weight) as Measurement;
  const dimensions = record(value.dimensions);

  function updateWeight(key: keyof Measurement, input: string) {
    const next: Record<string, unknown> = { ...weight };
    if (!input) delete next[key];
    else if (key === "value") {
      const amount = Number(input);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Use a positive number for package measurements.");
        return;
      }
      next.value = amount;
      next.unit ??= "KILOGRAM";
    } else next[key] = input;
    const nextPackage = { ...value };
    if (next.value != null) nextPackage.weight = next;
    else delete nextPackage.weight;
    setError("");
    onChange(nextPackage);
  }

  function updateDimensions(key: string, input: string) {
    const next = { ...dimensions };
    if (!input) delete next[key];
    else if (key === "unit") next.unit = input;
    else {
      const amount = Number(input);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Use a positive number for package measurements.");
        return;
      }
      next[key] = amount;
      next.unit ??= "CENTIMETER";
    }
    const nextPackage = { ...value };
    if (["length", "width", "height"].some((measurement) => next[measurement] != null)) nextPackage.dimensions = next;
    else delete nextPackage.dimensions;
    setError("");
    onChange(nextPackage);
  }

  function measurement(label: string, key: string) {
    return (
      <label className="space-y-1.5 text-sm font-medium">
        {label}
        <DeferredInput type="number" min="0" step="any" value={dimensions[key] == null ? "" : String(dimensions[key])} onCommit={(input) => updateDimensions(key, input)} />
      </label>
    );
  }

  return (
    <fieldset className="space-y-3 rounded-[var(--radius-control)] border border-border/70 p-3">
      <legend className="px-1 text-sm font-semibold">Package weight and size</legend>
      <p className="text-xs text-muted-foreground">Enter package measurements, not product dimensions. Leave unknown values empty.</p>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">
          Weight
          <DeferredInput type="number" min="0" step="any" value={weight.value == null ? "" : String(weight.value)} onCommit={(input) => updateWeight("value", input)} />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          Weight unit
          <select className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={weight.unit ?? ""} disabled={weight.value == null} onChange={(event) => updateWeight("unit", event.target.value)}>
            <option value="" disabled>Select unit</option>
            {weight.unit && !weightUnits.includes(weight.unit) ? <option value={weight.unit}>{weight.unit}</option> : null}
            {weightUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </label>
        {measurement("Length", "length")}
        {measurement("Width", "width")}
        {measurement("Height", "height")}
        <label className="space-y-1.5 text-sm font-medium">
          Size unit
          <select className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={String(dimensions.unit ?? "")} disabled={!["length", "width", "height"].some((measurement) => dimensions[measurement] != null)} onChange={(event) => updateDimensions("unit", event.target.value)}>
            <option value="" disabled>Select unit</option>
            {dimensions.unit && !dimensionUnits.includes(String(dimensions.unit)) ? <option value={String(dimensions.unit)}>{String(dimensions.unit)}</option> : null}
            {dimensionUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
