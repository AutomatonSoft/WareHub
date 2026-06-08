import React from "react";
import { cn } from "../../lib/cn";

type TabItem = {
  id: string;
  label: string;
};

type TabsProps = {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  ariaLabel?: string;
};

export function Tabs({ items, value, onChange, className, ariaLabel = "Tabs" }: TabsProps) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("ui-tabs", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          className="ui-tab focus-ring"
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

