"use client";

import { useLabels } from "../../../app/use-labels";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Skeleton } from "../../ui/skeleton";

export function XLJVLoadingState() {
  const t = useLabels();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.loading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

