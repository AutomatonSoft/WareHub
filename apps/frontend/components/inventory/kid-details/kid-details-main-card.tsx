import { Button } from "../../shared/button";
import { Card } from "../../ui/card";
import { KidDetailsGalleryCard } from "./kid-details-gallery-card";
import type { KidMeta } from "./kid-details-types";

type PendingUploadSummary = {
  count: number;
  totalSizeLabel: string;
  compressibleCount: number;
};

type NamesPreview = {
  visibleNames: string[];
  hiddenCount: number;
};

type RetryDiagnostics = {
  attempt: number;
  remaining: number;
  cooldownSeconds: number;
  max: number;
};

export function KidDetailsMainCard(props: {
  t: Record<string, string>;
  kidId: number;
  kidMeta: KidMeta;
  uploadingImages: boolean;
  retryingUpload: boolean;
  failedUploadFiles: File[];
  pendingUploadSummary: PendingUploadSummary | null;
  pendingUploadNamesPreview: NamesPreview;
  failedUploadNamesPreview: NamesPreview;
  retryDiagnostics: RetryDiagnostics | null;
  uploadRetryCooldownUntil: number;
  retryClockNow: number;
  uploadRetryAttempt: number;
  retryMaxAttempts: number;
  lastDeletedImageUrl: string | null;
  savingMainImage: boolean;
  removingImage: boolean;
  reorderingImage: boolean;
  restoringImage: boolean;
  draftEan: string;
  eanActionLoading: boolean;
  onDraftEanChange: (value: string) => void;
  onUploadImages: (files: FileList | null) => Promise<void>;
  onRetryUpload: () => Promise<void>;
  onClearFailedUploadBatch: () => void;
  onCopyFailedUploadNames: () => Promise<void>;
  onRestoreDeletedImage: () => Promise<void>;
  onClearPendingUploadBatch: () => void;
  onTakeNextEan: () => Promise<void>;
  onReserveDraftEan: () => Promise<void>;
  onMoveImage: (imageUrl: string, direction: "up" | "down") => Promise<void>;
  onSetMainImage: (imageUrl: string) => Promise<void>;
  onDeleteImage: (imageUrl: string) => Promise<void>;
}) {
  const {
    t,
    kidId,
    kidMeta,
    uploadingImages,
    retryingUpload,
    failedUploadFiles,
    pendingUploadSummary,
    pendingUploadNamesPreview,
    failedUploadNamesPreview,
    retryDiagnostics,
    uploadRetryCooldownUntil,
    retryClockNow,
    uploadRetryAttempt,
    retryMaxAttempts,
    lastDeletedImageUrl,
    savingMainImage,
    removingImage,
    reorderingImage,
    restoringImage,
    draftEan,
    eanActionLoading,
    onDraftEanChange,
    onUploadImages,
    onRetryUpload,
    onClearFailedUploadBatch,
    onCopyFailedUploadNames,
    onRestoreDeletedImage,
    onClearPendingUploadBatch,
    onTakeNextEan,
    onReserveDraftEan,
    onMoveImage,
    onSetMainImage,
    onDeleteImage
  } = props;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="space-y-2 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.kidProfile}</div>
          <div className="text-3xl font-semibold leading-none text-foreground">{kidMeta.kidNumber}</div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">{t.kid} ID: <span className="font-semibold text-foreground">{kidId}</span></div>
            <div className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">{t.account}: <span className="font-semibold text-foreground">{kidMeta.kidAccount}</span></div>
            <div className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">{t.place}: <span className="font-semibold text-foreground">{kidMeta.place}</span></div>
          </div>
        </div>
      </Card>

      <KidDetailsGalleryCard
        t={t}
        kidMeta={kidMeta}
        uploadingImages={uploadingImages}
        retryingUpload={retryingUpload}
        failedUploadFiles={failedUploadFiles}
        pendingUploadSummary={pendingUploadSummary}
        pendingUploadNamesPreview={pendingUploadNamesPreview}
        failedUploadNamesPreview={failedUploadNamesPreview}
        retryDiagnostics={retryDiagnostics}
        uploadRetryCooldownUntil={uploadRetryCooldownUntil}
        retryClockNow={retryClockNow}
        uploadRetryAttempt={uploadRetryAttempt}
        retryMaxAttempts={retryMaxAttempts}
        lastDeletedImageUrl={lastDeletedImageUrl}
        savingMainImage={savingMainImage}
        removingImage={removingImage}
        reorderingImage={reorderingImage}
        restoringImage={restoringImage}
        onUploadImages={onUploadImages}
        onRetryUpload={onRetryUpload}
        onClearFailedUploadBatch={onClearFailedUploadBatch}
        onCopyFailedUploadNames={onCopyFailedUploadNames}
        onRestoreDeletedImage={onRestoreDeletedImage}
        onClearPendingUploadBatch={onClearPendingUploadBatch}
        onMoveImage={onMoveImage}
        onSetMainImage={onSetMainImage}
        onDeleteImage={onDeleteImage}
      />

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input
            type="text"
            value={draftEan}
            onChange={(event) => onDraftEanChange(event.target.value)}
            placeholder={t.draftEanPlaceholder}
            className="h-10 w-56 rounded-xl border border-[color:var(--outline)] bg-white/80 px-3 text-sm text-[color:var(--text-primary)]"
            inputMode="numeric"
          />
          <Button type="button" variant="secondary" onClick={() => void onTakeNextEan()} disabled={eanActionLoading}>
            {t.takeNextEan}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void onReserveDraftEan()} disabled={eanActionLoading}>
            {t.reserveDraftEan}
          </Button>
          {savingMainImage ? <span className="text-xs text-[color:var(--text-muted)]">{t.savingMainImage}</span> : null}
          {removingImage ? <span className="text-xs text-[color:var(--text-muted)]">{t.deletingImage}</span> : null}
          {reorderingImage ? <span className="text-xs text-[color:var(--text-muted)]">{t.reorderingImages}</span> : null}
          {restoringImage ? <span className="text-xs text-[color:var(--text-muted)]">{t.restoringImage}</span> : null}
        </div>
      </Card>
    </div>
  );
}


