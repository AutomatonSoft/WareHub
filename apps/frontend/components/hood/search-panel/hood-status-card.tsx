"use client";

import { useLabels } from "../../../app/use-labels";
import { HoodStatusMeta } from "../hood-search-utils";
import { Badge } from "../../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { ErrorState } from "../../ui/error-state";

function variant(status?: string): "default" | "secondary" | "destructive" {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "failed") return "destructive";
  if (normalized === "saved" || normalized === "pushed") return "default";
  return "secondary";
}

export function HoodStatusCard({ statusMeta }: { statusMeta: HoodStatusMeta }) {
  const t = useLabels();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.hoodDbStatus}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm md:grid-cols-2">
        <div>{t.localSave}: <Badge variant={variant(statusMeta.local_save_status)}>{statusMeta.local_save_status || "-"}</Badge></div>
        <div>{t.externalPush}: <Badge variant={variant(statusMeta.external_push_status)}>{statusMeta.external_push_status || "-"}</Badge></div>
        <div>{t.responseId}: {statusMeta.response_id ?? "-"}</div>
        <div>{t.updated}: {statusMeta.updated_at || "-"}</div>
        {statusMeta.external_push_error ? <ErrorState title="Push error" description={statusMeta.external_push_error} className="md:col-span-2" /> : null}
      </CardContent>
    </Card>
  );
}

