import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DataMetricCard({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between pt-0">
        <p className="text-lg font-semibold tracking-tight">{value}</p>
        {icon}
      </CardContent>
    </Card>
  );
}

