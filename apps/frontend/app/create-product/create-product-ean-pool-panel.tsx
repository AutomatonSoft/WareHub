"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarcodeIcon, LoaderCircleIcon, PlusIcon, RefreshCwIcon } from "lucide-react";

import { useLabels } from "../use-labels";
import { fetchEanPoolStatsCount, importEansToPool } from "../../components/editor/ean-pool-api";
import { normalizeEanInputLines } from "../../components/editor/ean-input-model";
import { useToast } from "../../components/shared/toast-provider";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";

export function CreateProductEanPoolPanel() {
  const t = useLabels();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [isPoolCountLoading, setIsPoolCountLoading] = useState(true);
  const [poolCountUnavailable, setPoolCountUnavailable] = useState(false);

  const eans = useMemo(() => normalizeEanInputLines(value), [value]);

  const loadPoolCount = useCallback(async () => {
    setIsPoolCountLoading(true);
    setPoolCountUnavailable(false);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const count = await fetchEanPoolStatsCount();
        if (typeof count === "number") {
          setPoolCount(count);
          setIsPoolCountLoading(false);
          return;
        }
      } catch {
        // A pool-count request must never break the create-product workflow.
      }

      if (attempt === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
      }
    }

    setPoolCount(null);
    setPoolCountUnavailable(true);
    setIsPoolCountLoading(false);
  }, []);

  useEffect(() => {
    void loadPoolCount();
  }, [loadPoolCount]);

  useEffect(() => {
    if (isOpen) void loadPoolCount();
  }, [isOpen, loadPoolCount]);

  async function importEans() {
    if (eans.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { response, importedCount, errorText } = await importEansToPool(eans);
      if (!response.ok) {
        showToast(`${t.importFailed}: HTTP ${response.status}${errorText ? ` — ${errorText}` : ""}`, "error");
        return;
      }
      setValue("");
      setIsOpen(false);
      await loadPoolCount();
      showToast(`${t.imported} ${importedCount} ${t.eanImportedSuffix}`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t.importTimeoutError, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex min-h-10 items-center gap-2" aria-label={t.eanPoolImport}>
        <span
          className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] border border-border/70 bg-muted/30 px-3 text-sm font-semibold tabular-nums text-foreground"
          title={t.eanPoolImport}
        >
          <BarcodeIcon className="size-4 text-primary" aria-hidden="true" />
          {poolCount ?? (isPoolCountLoading ? <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" aria-label="Loading EAN pool" /> : "Unavailable")}
        </span>
        {poolCountUnavailable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={() => void loadPoolCount()}
            title="Retry EAN pool count"
            aria-label="Retry EAN pool count"
          >
            <RefreshCwIcon className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(true)}>
          <PlusIcon className="size-4" aria-hidden="true" />
          {t.addEan}
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.eanPoolImport}</DialogTitle>
            <DialogDescription>{t.eanPoolOneEanPerLine}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="min-h-40"
            placeholder={"4006381333931\n4006381333932\n4006381333933"}
          />
          </div>
          <DialogFooter>
            <span className="text-xs text-muted-foreground">{t.rows}: {eans.length}</span>
            <Button type="button" onClick={() => void importEans()} disabled={eans.length === 0 || isSubmitting}>
              {isSubmitting ? t.uploading : t.uploadEanList}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
