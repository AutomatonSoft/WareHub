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
      <TabsList className="h-auto w-full flex-wrap justify-center rounded-xl border border-border/70 bg-muted/30 p-1 md:w-auto">
        {props.items.map((item) => (
          <TabsTrigger key={item.id} value={item.id} className="h-9 rounded-lg px-3 text-[11px] uppercase tracking-wide">
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
