"use client";

import { useLabels } from "../../../app/use-labels";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Skeleton } from "../../ui/skeleton";

export function HoodLoadingState() {
  const t = useLabels();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.loadingHoodData}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </CardContent>
    </Card>
  );
}

