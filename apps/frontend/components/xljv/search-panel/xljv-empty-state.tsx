"use client";

import { useLabels } from "../../../app/use-labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";

export function XLJVEmptyState({ message }: { message: string }) {
  const t = useLabels();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.xljvNoResult}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {t.xljvSearchByEanHint}
      </CardContent>
    </Card>
  );
}

