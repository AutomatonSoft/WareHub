"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn";

type FancySelectOption<T extends string> = {
  value: T;
  label: string;
};

export function FancySelect<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel
}: {
  value: T;
  options: FancySelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const generatedId = useId();
  const listboxId = `fancy-select-${generatedId}`;

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "",
    [options, value]
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    if (!open || !rootRef.current) {
      return;
    }
    const rect = rootRef.current.getBoundingClientRect();
    const estimatedMenuHeight = 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setOpenUpward(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className={cn("relative", open ? "z-[420]" : "", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        className="ui-control-button focus-ring inline-flex w-full items-center justify-between px-3 text-left text-sm"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={14} className={cn("text-[color:var(--text-muted)] transition-transform", open ? "rotate-180" : "")} />
      </button>

      {open ? (
        <div
          className={cn(
            "absolute left-0 right-0 z-[430] overflow-hidden rounded-xl border border-[color:var(--outline)] bg-[color:var(--surface-high)] shadow-[0_14px_28px_rgba(28,42,98,0.22)] backdrop-blur-md",
            openUpward ? "ui-dropdown-enter-up bottom-full mb-1" : "ui-dropdown-enter top-full mt-1"
          )}
        >
          <ul id={listboxId} role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto py-1">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <li key={option.value} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "focus-ring flex w-full items-center justify-between px-3 py-2 text-sm transition",
                      active
                        ? "bg-[color:rgba(129,135,255,0.2)] text-[color:var(--text-primary)]"
                        : "text-[color:var(--text-secondary)] hover:bg-[color:rgba(129,135,255,0.14)] hover:text-[color:var(--text-primary)]"
                    )}
                  >
                    <span>{option.label}</span>
                    {active ? <Check size={14} className="text-[color:var(--primary)]" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
