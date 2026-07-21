"use client";

import { Loader2 } from "lucide-react";

import { useLabels } from "../../app/use-labels";
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
  const t = useLabels();
  const selectedTargetLabels = plan?.targets.map((target) => target.label) ?? [];
  const hasChanges = changedFields.length > 0;
  const pendingUploadCount = "pending_uploads" in currentDraft ? currentDraft.pending_uploads.length : pendingUploads.length;

  return (
    <SectionCard title={t.productEditorReviewPlanTitle} subtitle={t.productEditorReviewPlanSubtitle.replace("{group}", groupLabel)} className="rounded-xl border-border bg-card shadow-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="lg" className="h-8 px-3 text-xs" disabled={!hasChanges || planning} onClick={onReviewChanges}>
              {planning ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
              {t.productEditorReviewChangesAction}
            </Button>
            <Button type="button" size="lg" className="h-8 px-3 text-xs" disabled={!plan || !confirmationChecked || applying} onClick={onApply}>
              {applying ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
              {t.productEditorApplyPlannedChangesAction}
            </Button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <ReviewStat label={t.productEditorReviewChanged} value={String(changedFields.length)} />
          <ReviewStat label={t.productEditorReviewRemoved} value={String(removedImages.length)} />
          <ReviewStat label={t.productEditorReviewUploads} value={String(pendingUploadCount)} />
          <ReviewStat label={t.productEditorReviewPlan} value={plan ? t.ready : t.productEditorReviewMissing} />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={confirmationChecked} onCheckedChange={(checked) => onToggleConfirmation(checked === true)} />
          <span>{t.productEditorLiveApplyConfirm.replace("{action}", liveActionLabel)}</span>
        </label>

        <div className="text-xs text-muted-foreground">
          {t.productEditorActiveScope.replace("{targets}", selectedTargetLabels.length > 0 ? selectedTargetLabels.join(", ") : t.productEditorNoPlannedTargetsYet)}{" "}
          {t.productEditorApplyActiveTabOnly}
        </div>

        {pendingUploads.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-900 dark:text-amber-200">
            {t.productEditorPendingUploadsWarning}
          </div>
        ) : null}

        {hasChanges ? (
          <details className="rounded-xl border border-border bg-muted/30 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-foreground">{t.productEditorChangedFieldKeys}</summary>
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
          <summary className="cursor-pointer text-xs font-semibold text-foreground">{t.productEditorImageAndFileDetails}</summary>
          <div className="mt-2">
            <ImageChangeSummary removedImages={removedImages} pendingUploads={pendingUploads} />
          </div>
        </details>

        {plan ? (
          <details className="rounded-xl border border-border bg-muted/30 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-foreground">{t.productEditorPlanPreviewSummary}</summary>
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
  const t = useLabels();
  return (
    <Card className="rounded-xl border-border bg-card shadow-none">
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="text-sm">{t.productEditorPlanPreviewSummary}</CardTitle>
          <CardDescription>{t.productEditorPlanPreviewSubtitle}</CardDescription>
        </div>
        <StatusBadge tone="planned">{t.productEditorPlanRisk.replace("{risk}", plan.risk_level)}</StatusBadge>
      </CardHeader>

      <CardContent>
        <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          <ReviewStat label={t.productEditorPlanId} value={plan.plan_id.slice(0, 8)} />
          <ReviewStat label={t.productEditorPlanTargets} value={String(plan.targets.length)} />
          <ReviewStat label={t.productEditorPolicy} value={String(plan.summary.target_policy ?? "-")} />
        </div>

        <div className="mt-2.5 space-y-2">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t.productEditorPlanTargets}
          </div>
          <div className="space-y-2">
            {plan.targets.map((target) => (
              <div key={target.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-2 py-1.5">
                <div>
                  <div className="text-sm font-medium text-foreground">{target.label}</div>
                  <div className="text-xs text-muted-foreground">{target.id}</div>
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{t.productEditorLiveUpdate}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t.productEditorWarnings}
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
  const t = useLabels();
  return (
    <Card className="rounded-xl border-border bg-card shadow-none">
      <CardContent className="pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.productEditorImageChangeReview}</h3>
      <div className="mt-2 space-y-2 text-xs text-muted-foreground">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]">{t.productEditorRemovedFromProduct}</div>
          {removedImages.length > 0 ? (
            <div className="space-y-2">
              {removedImages.map((imageUrl) => (
                <div key={imageUrl} className="rounded-xl border border-border bg-background px-2 py-1.5 break-all">
                  {imageUrl}
                </div>
              ))}
            </div>
          ) : (
            <p>{t.productEditorNoRemovedProductImages}</p>
          )}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]">{t.productEditorPendingLocalFiles}</div>
          {pendingUploads.length > 0 ? (
            <div className="space-y-2">
              {pendingUploads.map((upload) => (
                <div key={upload.id} className="rounded-xl border border-border bg-background px-2 py-1.5">
                  {upload.name}
                </div>
              ))}
            </div>
          ) : (
            <p>{t.productEditorNoPendingUploadFiles}</p>
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

