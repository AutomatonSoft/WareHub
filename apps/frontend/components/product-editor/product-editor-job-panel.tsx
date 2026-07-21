"use client";

import { Loader2 } from "lucide-react";
import { useLabels } from "../../app/use-labels";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { SectionCard } from "../ui/section-card";
import { StatusBadge } from "../ui/status-badge";
import type { ProductEditorJobResponse } from "./product-editor-types";

type ProductEditorJobPanelProps = {
  job: ProductEditorJobResponse | null;
  loading: boolean;
  onRefresh: () => void;
};

export function ProductEditorJobPanel({ job, loading, onRefresh }: ProductEditorJobPanelProps) {
  const t = useLabels();
  if (!job) return null;
  const jobStatus = String(job.status || "").toLowerCase();
  const isInFlight = jobStatus === "queued" || jobStatus === "running";
  const total = toNumber(job.summary.total);
  const applied = toNumber(job.summary.applied ?? job.summary.success);
  const skipped = toNumber(job.summary.skipped);
  const failed = toNumber(job.summary.failed);
  const completed = Math.min(total || applied + skipped + failed, applied + skipped + failed);
  const progressPercent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : isInFlight ? 15 : 100;
  const progressPhase = String(job.summary.progress_phase || jobStatus || "").trim();
  const progressMessage = String(job.summary.progress_message || "").trim();

  return (
    <SectionCard title={t.productEditorApplyResultTitle} subtitle={t.productEditorApplyResultSubtitle} className="rounded-xl border-border bg-card shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {t.productEditorApplyResultHint}
        </p>
        <Button type="button" variant="secondary" disabled={loading || !job.job_id} onClick={onRefresh}>
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
          {t.productEditorRefreshJob}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <JobStat label={t.productEditorJobId} value={job.job_id ? job.job_id.slice(0, 8) : t.pending} />
        <JobStat label={t.status} value={String(job.status)} />
        <JobStat label={t.productEditorSucceeded} value={String(job.summary.success ?? 0)} />
        <JobStat label={t.productEditorFailed} value={String(job.summary.failed ?? 0)} />
      </div>

      {isInFlight || progressPhase || total > 0 ? (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-foreground">{progressMessage || t.productEditorJvBatchProgress}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {progressPhase || t.productEditorStatusLabel} / {completed}/{total || completed || 0}
              </div>
            </div>
            <StatusBadge tone="planned">{jobStatus}</StatusBadge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full bg-primary transition-all ${isInFlight ? "animate-pulse" : ""}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {job.targets.map((target) => (
          <article
            key={target.target_id}
            className="rounded-xl border border-border bg-background px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{target.target_id}</div>
                <div className="text-xs text-muted-foreground">HTTP {target.status_code}</div>
              </div>
              <StatusBadge tone={target.status === "success" ? "found" : "error"}>{target.status}</StatusBadge>
            </div>
            {target.error ? (
              <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="font-medium">{target.error.code}</div>
                <div className="mt-1">{target.error.message}</div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                {t.productEditorTargetCompleted}
              </div>
            )}
          </article>
        ))}
      </div>

      {job.error ? (
        <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <div className="font-medium">{job.error.code}</div>
          <div className="mt-1">{job.error.message}</div>
        </div>
      ) : null}
    </SectionCard>
  );
}

function JobStat({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm" className="rounded-xl border-border bg-muted/30 shadow-none">
      <CardHeader className="pb-0">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="break-all text-sm font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
