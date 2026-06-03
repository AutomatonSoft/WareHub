"use client";

import { useEffect, useMemo, useState } from "react";
import { useLabels } from "../../app/use-labels";
import { Button } from "../shared/button";
import { Card } from "../shared/card";
import { buildEanUsageTimelineRows } from "./ean-usage-model";
import { fetchEanUsageByEan } from "./inventory-api";

type KidEanUsagePanelProps = {
  eans: string[];
};

export function KidEanUsagePanel({ eans }: KidEanUsagePanelProps) {
  const t = useLabels();
  const [selectedEan, setSelectedEan] = useState<string>(eans[0] ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poolStatus, setPoolStatus] = useState<string>("-");
  const [rows, setRows] = useState<ReturnType<typeof buildEanUsageTimelineRows>>([]);

  useEffect(() => {
    setSelectedEan((current) => (current ? current : eans[0] ?? ""));
  }, [eans]);

  async function loadUsage() {
    if (!selectedEan.trim()) {
      setRows([]);
      setPoolStatus("-");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchEanUsageByEan(selectedEan);
      const pool = payload.pool && typeof payload.pool === "object" ? payload.pool : null;
      const statusValue = pool && typeof pool.status === "string" ? pool.status : "-";
      setPoolStatus(statusValue);
      setRows(buildEanUsageTimelineRows(Array.isArray(payload.usages) ? payload.usages : []));
    } catch (requestError) {
      setRows([]);
      setPoolStatus("-");
      setError(requestError instanceof Error ? requestError.message : t.failedLoadEanUsage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEan]);

  const hasEans = eans.length > 0;
  const eanOptions = useMemo(() => Array.from(new Set(eans.map((value) => value.trim()).filter(Boolean))), [eans]);

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{t.eanUsageTimeline}</div>
        <Button type="button" variant="secondary" onClick={() => void loadUsage()} disabled={loading || !hasEans}>
          {loading ? t.refreshing : t.refreshUsage}
        </Button>
      </div>

      {!hasEans ? (
        <div className="text-sm text-[color:var(--text-muted)]">{t.noEanLinkedForKid}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 rounded-xl border border-[color:var(--outline)] bg-white/80 px-3 text-sm text-[color:var(--text-primary)]"
              value={selectedEan}
              onChange={(event) => setSelectedEan(event.target.value)}
            >
              {eanOptions.map((ean) => (
                <option key={ean} value={ean}>
                  {ean}
                </option>
              ))}
            </select>
            <span className="text-xs text-[color:var(--text-secondary)]">{t.poolStatus}: {poolStatus}</span>
          </div>

          {error ? <div className="text-sm text-[color:var(--warning)]">{error}</div> : null}

          {rows.length === 0 ? (
            <div className="text-sm text-[color:var(--text-muted)]">{t.noUsageRecordsForSelectedEan}</div>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-[color:var(--outline)] px-3 py-2 text-xs">
                  <div className="font-medium text-[color:var(--text-primary)]">
                    {t.timelineEvent}: {row.event} | {t.timelineStatus}: {row.status}
                  </div>
                  <div className="mt-1 text-[color:var(--text-secondary)]">
                    {t.timelineWhen}: {row.eventAt}
                  </div>
                  <div className="mt-1 text-[color:var(--text-secondary)]">
                    {t.timelineMarketplace}: {row.marketplace} | {t.timelineAccount}: {row.account}
                  </div>
                  <div className="mt-1 text-[color:var(--text-secondary)]">
                    {t.timelineKidId}: {row.kidId}
                  </div>
                  <div className="mt-1 text-[color:var(--text-secondary)]">
                    site: {row.site} | site_key: {row.siteKey}
                  </div>
                  <div className="mt-1 text-[color:var(--text-secondary)]">
                    local_product_id: {row.localProductId} | source_product_id: {row.sourceProductId}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

