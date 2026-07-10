"use client";

import { useQuery } from "@tanstack/react-query";
import { useLabels } from "../../app/use-labels";
import { Card } from "../shared/card";
import { fetchEanPoolCount } from "./inventory-api";

export function EanPoolSummary() {
  const t = useLabels();
  const { data, isPending } = useQuery({
    queryKey: ["ean-pool-count"],
    queryFn: fetchEanPoolCount
  });

  return (
    <Card className="bg-[color:rgba(129,135,255,0.05)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[color:var(--text-secondary)]">{t.eanPoolProducts}</p>
        <p className="text-xl font-semibold text-[color:var(--text-primary)]">{isPending ? t.loadingEllipsis : (data ?? "-")}</p>
      </div>
    </Card>
  );
}
