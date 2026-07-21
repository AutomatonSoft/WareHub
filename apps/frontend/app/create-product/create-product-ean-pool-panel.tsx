"use client";

import { useEffect, useMemo, useState } from "react";
import { BarcodeIcon, PlusIcon } from "lucide-react";

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

  const eans = useMemo(() => normalizeEanInputLines(value), [value]);

  async function loadPoolCount() {
    try {
      const count = await fetchEanPoolStatsCount();
      setPoolCount(count);
    } catch {
      // The count is a non-critical background request. A timeout or an aborted
      // request must not surface as an unhandled runtime error in Next.js.
      setPoolCount(null);
    }
  }

  useEffect(() => {
    void loadPoolCount();
  }, []);

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
          {poolCount ?? "—"}
        </span>
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
