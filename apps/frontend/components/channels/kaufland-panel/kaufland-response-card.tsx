"use client";

import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { ScrollArea } from "../../ui/scroll-area";

export function KauflandResponseCard({ title, payload }: { title: string; payload: unknown }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[420px] rounded-xl border border-border/60 bg-muted/30 p-3">
          <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


