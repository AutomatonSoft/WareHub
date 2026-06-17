export function occupancyValue(code: string) {
  return ((code.charCodeAt(0) + Number(code[1])) * 13) % 100;
}

export function occupancyToneClass(occupancy: number) {
  if (occupancy > 80) {
    return "border-primary/40 bg-primary/15 text-primary";
  }

  if (occupancy > 55) {
    return "border-warning/40 bg-warning/15 text-warning";
  }

  return "border-border bg-muted/40 text-muted-foreground";
}
