"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";

export function XLJVEmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No Result</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        Search by EAN to load XL/JV product data.
      </CardContent>
    </Card>
  );
}

