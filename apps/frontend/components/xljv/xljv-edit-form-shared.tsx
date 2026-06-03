"use client";

import { Dispatch, SetStateAction } from "react";
import { Badge } from "../shared/badge";
import { XLJVProduct } from "./xljv-edit-utils";

export type JvContent = {
  language_code?: string;
  name?: string;
  keywords?: string;
  description?: string;
  bezeichnung?: string;
  short_description?: string;
  short_description_real?: string;
  kurzbeschreibung?: string;
};

export function SectionHeader({
  title,
  badge,
  description
}: {
  title: string;
  badge: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--text-secondary)]">{description}</p>
      </div>
      <Badge tone="neutral" className="w-fit shrink-0">
        {badge}
      </Badge>
    </div>
  );
}

export function ToggleField({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex h-11 items-center justify-between gap-3 rounded-xl border border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.04)] px-3 text-sm">
      <span className="font-medium text-[color:var(--text-primary)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? "bg-[color:var(--primary)]" : "bg-[color:rgba(15,23,42,0.18)]"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </label>
  );
}

export function updateJvField(
  setForm: Dispatch<SetStateAction<XLJVProduct | null>>,
  key: keyof NonNullable<XLJVProduct["jv_fields"]>,
  value: string | number | boolean
) {
  setForm((current) =>
    current ? { ...current, jv_fields: { ...(current.jv_fields || {}), [key]: value } } : current
  );
}

export function toggleIsSofort(setForm: Dispatch<SetStateAction<XLJVProduct | null>>) {
  setForm((current) =>
    current
      ? {
          ...current,
          jv_fields: {
            ...(current.jv_fields || {}),
            is_sofort: !Boolean(current.jv_fields?.is_sofort)
          }
        }
      : current
  );
}

export function toggleInactive(setForm: Dispatch<SetStateAction<XLJVProduct | null>>) {
  setForm((current) =>
    current
      ? (() => {
          const currentInactive = Number(current.jv_fields?.inaktiv ?? 0) === 1;
          const nextInactive = currentInactive ? 0 : 1;
          return {
            ...current,
            status: nextInactive === 0,
            jv_fields: {
              ...(current.jv_fields || {}),
              inaktiv: nextInactive
            }
          };
        })()
      : current
  );
}
