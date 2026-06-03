"use client";

import { useLabels } from "../../app/use-labels";
import { Card } from "../shared/card";
import { HoodStatusMeta, statusBadgeClass } from "./hood-search-utils";

type HoodStatusCardProps = {
  statusMeta: HoodStatusMeta;
};

export function HoodStatusCard({ statusMeta }: HoodStatusCardProps) {
  const t = useLabels();
  return (
    <Card className="space-y-2">
      <div className="text-xs uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.hoodDbStatus}</div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="text-sm text-[color:var(--text-secondary)]">
          <strong className="text-[color:var(--text-primary)]">{t.localSave}:</strong>{" "}
          <span className={statusBadgeClass(statusMeta.local_save_status)}>
            {statusMeta.local_save_status || "-"}
          </span>
        </div>
        <div className="text-sm text-[color:var(--text-secondary)]">
          <strong className="text-[color:var(--text-primary)]">{t.externalPush}:</strong>{" "}
          <span className={statusBadgeClass(statusMeta.external_push_status)}>
            {statusMeta.external_push_status || "-"}
          </span>
        </div>
        <div className="text-sm text-[color:var(--text-secondary)]">
          <strong className="text-[color:var(--text-primary)]">{t.responseId}:</strong>{" "}
          {statusMeta.response_id ?? "-"}
        </div>
        <div className="text-sm text-[color:var(--text-secondary)]">
          <strong className="text-[color:var(--text-primary)]">{t.updated}:</strong>{" "}
          {statusMeta.updated_at || "-"}
        </div>
      </div>
      {statusMeta.external_push_error ? (
        <div className="ui-status-banner ui-status-danger break-words text-xs">
          {statusMeta.external_push_error}
        </div>
      ) : null}
    </Card>
  );
}
