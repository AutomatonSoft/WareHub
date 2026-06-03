"use client";

import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Skeleton } from "../../ui/skeleton";

export function XLJVLoadingState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loading</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

