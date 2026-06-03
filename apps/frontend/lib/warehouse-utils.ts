export function occupancyValue(code: string) {
  return ((code.charCodeAt(0) + Number(code[1])) * 13) % 100;
}

export function occupancyGradient(occupancy: number) {
  if (occupancy > 80) {
    return "from-emerald-600 to-emerald-500";
  }

  if (occupancy > 55) {
    return "from-emerald-500 to-emerald-400";
  }

  return "from-muted to-emerald-100";
}
