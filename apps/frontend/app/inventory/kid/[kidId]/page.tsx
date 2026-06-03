"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useLabels } from "../../../use-labels";
import { AppShell } from "../../../../components/layout/app-shell";
import { SectionTitle } from "../../../../components/shared/section-title";
import { KidDetailsView } from "../../../../components/inventory/kid-details-view";

export default function KidDetailsPage() {
  const t = useLabels();
  const params = useParams<{ kidId: string }>();
  const kidIdRaw = params?.kidId || "";
  const kidId = useMemo(() => Number.parseInt(kidIdRaw, 10), [kidIdRaw]);

  return (
    <AppShell title={t.inventoryKidDetails} subtitle={t.allParentChildOrdersForKid}>
      <SectionTitle title={t.kidDetails} subtitle={`${t.kid} ID: ${Number.isFinite(kidId) ? kidId : kidIdRaw}`} />
      {Number.isFinite(kidId) ? (
        <KidDetailsView kidId={kidId} />
      ) : (
        <div className="text-sm text-[color:var(--warning)]">{t.invalidKidId}</div>
      )}
    </AppShell>
  );
}
