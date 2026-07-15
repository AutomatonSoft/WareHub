"use client";

import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

function Calendar({ className, ...props }: React.ComponentProps<typeof DayPicker>) {
  return <DayPicker className={cn("wh-calendar", className)} {...props} />;
}

export { Calendar };
