"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <label className={cn("relative inline-flex cursor-pointer items-center", className)}>
      <input type="checkbox" className="peer sr-only" {...props} />
      <span
        className={cn(
          "h-6 w-11 rounded-full border border-border bg-slate-200 transition-colors",
          "peer-checked:border-emerald-600 peer-checked:bg-emerald-600",
          "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/40 peer-focus-visible:ring-offset-2"
        )}
      />
      <span
        className={cn(
          "pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full border border-slate-300 bg-white shadow-sm transition-transform",
          "peer-checked:translate-x-5"
        )}
      />
    </label>
  );
}
