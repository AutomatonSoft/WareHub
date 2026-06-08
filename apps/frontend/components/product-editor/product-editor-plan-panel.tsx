"use client";

import { Loader2 } from "lucide-react";

import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { SectionCard } from "../ui/section-card";
import { StatusBadge } from "../ui/status-badge";
import type {
  ProductEditorHoodDraft,
  ProductEditorJvDraft,
  ProductEditorPendingUpload,
  ProductEditorPlanResponse
} from "./product-editor-types";

type ProductEditorPlanPanelProps = {
  groupLabel: string;
  liveActionLabel: string;
  changedFields: string[];
  removedImages: string[];
  pendingUploads?: ProductEditorPendingUpload[];
  currentDraft: ProductEditorHoodDraft | ProductEditorJvDraft;
  plan: ProductEditorPlanResponse | null;
  planning: boolean;
  applying: boolean;
  confirmationChecked: boolean;
  onToggleConfirmation: (checked: boolean) => void;
  onReviewChanges: () => void;
  onApply: () => void;
};

export function ProductEditorPlanPanel({
  groupLabel,
  liveActionLabel,
  changedFields,
  removedImages,
  pendingUploads = [],
  currentDraft,
  plan,
  planning,
  applying,
  confirmationChecked,
  onToggleConfirmation,
  onReviewChanges,
  onApply
}: ProductEditorPlanPanelProps) {
  const selectedTargetLabels = plan?.targets.map((target) => target.label) ?? [];
  const hasChanges = changedFields.length > 0;
  const pendingUploadCount = "pending_uploads" in currentDraft ? currentDraft.pending_uploads.length : pendingUploads.length;

  return (
    <SectionCard title="Review And Plan" subtitle={`Live ${groupLabel} apply gate`} className="rounded-xl border-border bg-card shadow-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="lg" className="h-8 px-3 text-xs" disabled={!hasChanges || planning} onClick={onReviewChanges}>
              {planning ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
              Review Changes
            </Button>
            <Button type="button" size="lg" className="h-8 px-3 text-xs" disabled={!plan || !confirmationChecked || applying} onClick={onApply}>
              {applying ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
              Apply Planned Changes
            </Button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <ReviewStat label="Changed" value={String(changedFields.length)} />
          <ReviewStat label="Removed" value={String(removedImages.length)} />
          <ReviewStat label="Uploads" value={String(pendingUploadCount)} />
          <ReviewStat label="Plan" value={plan ? "Ready" : "Missing"} />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={confirmationChecked} onCheckedChange={(checked) => onToggleConfirmation(checked === true)} />
          <span>{`I understand this will send a live ${liveActionLabel} for the active tab only.`}</span>
        </label>

        <div className="text-xs text-muted-foreground">
          Active scope: {selectedTargetLabels.length > 0 ? selectedTargetLabels.join(", ") : "No planned targets yet"}.
          Apply stays active-tab only.
        </div>

        {pendingUploads.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-900 dark:text-amber-200">
            Pending uploads stay local-only. Apply is expected to fail safely until apply-time upload support is implemented.
          </div>
        ) : null}

        {hasChanges ? (
          <details className="rounded-xl border border-border bg-muted/30 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-foreground">Changed field keys</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
            {changedFields.map((field) => (
              <span
                key={field}
                className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary"
              >
                {field}
              </span>
            ))}
            </div>
          </details>
        ) : null}

        <details className="rounded-xl border border-border bg-muted/30 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-foreground">Image and file details</summary>
          <div className="mt-2">
            <ImageChangeSummary removedImages={removedImages} pendingUploads={pendingUploads} />
          </div>
        </details>

        {plan ? (
          <details className="rounded-xl border border-border bg-muted/30 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-foreground">Plan preview</summary>
            <div className="mt-2">
              <PlanDetails plan={plan} />
            </div>
          </details>
        ) : null}
      </div>
    </SectionCard>
  );
}

function PlanDetails({ plan }: { plan: ProductEditorPlanResponse }) {
  return (
    <Card className="rounded-xl border-border bg-card shadow-none">
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="text-sm">Plan preview</CardTitle>
          <CardDescription>Generated by Orchestrator for the current draft.</CardDescription>
        </div>
        <StatusBadge tone="planned">Risk {plan.risk_level}</StatusBadge>
      </CardHeader>

      <CardContent>
        <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          <ReviewStat label="Plan ID" value={plan.plan_id.slice(0, 8)} />
          <ReviewStat label="Targets" value={String(plan.targets.length)} />
          <ReviewStat label="Policy" value={String(plan.summary.target_policy ?? "-")} />
        </div>

        <div className="mt-2.5 space-y-2">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Targets
          </div>
          <div className="space-y-2">
            {plan.targets.map((target) => (
              <div key={target.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-2 py-1.5">
                <div>
                  <div className="text-sm font-medium text-foreground">{target.label}</div>
                  <div className="text-xs text-muted-foreground">{target.id}</div>
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">live update</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Warnings
          </div>
          <div className="space-y-2">
            {plan.warnings.map((warning) => (
              <div key={warning.code} className="rounded-xl border border-amber-200 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-200">
                <div className="font-medium">{warning.code}</div>
                <div className="mt-1">{warning.message}</div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ImageChangeSummary({
  removedImages,
  pendingUploads
}: {
  removedImages: string[];
  pendingUploads: ProductEditorPendingUpload[];
}) {
  return (
    <Card className="rounded-xl border-border bg-card shadow-none">
      <CardContent className="pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Image change review</h3>
      <div className="mt-2 space-y-2 text-xs text-muted-foreground">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]">Removed from product</div>
          {removedImages.length > 0 ? (
            <div className="space-y-2">
              {removedImages.map((imageUrl) => (
                <div key={imageUrl} className="rounded-xl border border-border bg-background px-2 py-1.5 break-all">
                  {imageUrl}
                </div>
              ))}
            </div>
          ) : (
            <p>No removed product images.</p>
          )}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]">Pending local files</div>
          {pendingUploads.length > 0 ? (
            <div className="space-y-2">
              {pendingUploads.map((upload) => (
                <div key={upload.id} className="rounded-xl border border-border bg-background px-2 py-1.5">
                  {upload.name}
                </div>
              ))}
            </div>
          ) : (
            <p>No pending upload files.</p>
          )}
        </div>
      </div>
      </CardContent>
    </Card>
  );
}

function ReviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-2 py-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-all text-xs font-semibold text-foreground">{value}</div>
    </div>
  );
}

