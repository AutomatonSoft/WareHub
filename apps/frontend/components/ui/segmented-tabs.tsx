"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function SegmentedTabs(props: {
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ id: string; label: string }>;
  className?: string;
}) {
  return (
    <Tabs value={props.value} onValueChange={props.onValueChange} className={cn("w-full", props.className)}>
      <TabsList className="h-auto w-full flex-wrap justify-center rounded-[var(--radius-card)] border border-border bg-muted/25 p-1 md:w-auto">
        {props.items.map((item) => (
          <TabsTrigger key={item.id} value={item.id} className="h-9 rounded-[var(--radius-control)] px-3 text-[11px] uppercase tracking-[0.08em]">
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
