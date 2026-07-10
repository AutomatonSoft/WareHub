"use client";

import { Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLabels } from "../../app/use-labels";
import { useToast } from "../shared/toast-provider";
import { Button } from "../ui/button";
import { importKidGreenFile, type KidGreenImportProgressEvent } from "./inventory-api";

const DEFAULT_WORKERS = 5;

type ImportKidGreenButtonProps = {
  onImported?: () => Promise<unknown> | unknown;
};

export function ImportKidGreenButton({ onImported }: ImportKidGreenButtonProps) {
  const t = useLabels();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  function renderOverlay(content: ReactNode) {
    if (!isMounted || typeof document === "undefined") {
      return null;
    }
    return createPortal(content, document.body);
  }

  function handleProgressEvent(event: KidGreenImportProgressEvent) {
    if (event.type === "start") {
      setProgressPercent(18);
      setProgressLabel(t.kidGreenPreparingItems.replace("{count}", String(event.unique_kids)));
      return;
    }

    if (event.type === "afterbuy_fetched") {
      const ratio = event.total > 0 ? event.completed / event.total : 1;
      const percent = 20 + Math.round(ratio * 35);
      setProgressPercent(Math.max(20, Math.min(55, percent)));
      setProgressLabel(
        event.error
          ? t.kidGreenAfterbuyFetchFailed
              .replace("{kid}", event.kid_number)
              .replace("{completed}", String(event.completed))
              .replace("{total}", String(event.total))
          : t.kidGreenAfterbuyFetched
              .replace("{kid}", event.kid_number)
              .replace("{completed}", String(event.completed))
              .replace("{total}", String(event.total))
      );
      return;
    }

    if (event.type === "kid_processed") {
      const ratio = event.total > 0 ? event.completed / event.total : 1;
      const percent = 55 + Math.round(ratio * 44);
      setProgressPercent(Math.max(55, Math.min(99, percent)));
      setProgressLabel(
        event.status === "ok"
          ? t.kidGreenImportedProgress
              .replace("{kid}", event.kid_number)
              .replace("{completed}", String(event.completed))
              .replace("{total}", String(event.total))
              .replace("{created}", String(event.orders_created))
              .replace("{updated}", String(event.orders_updated))
          : t.kidGreenProcessedProgress
              .replace("{kid}", event.kid_number)
              .replace("{completed}", String(event.completed))
              .replace("{total}", String(event.total))
              .replace("{status}", String(event.error || event.status))
      );
      return;
    }

    if (event.type === "complete") {
      setProgressPercent(100);
      setProgressLabel(t.importCompleted);
      return;
    }

    if (event.type === "error") {
      setProgressLabel(event.message);
    }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setSelectedFileName(file.name);
    setIsImporting(true);
    setProgressPercent(0);
    setProgressLabel(t.uploadingFile);
    try {
      const result = await importKidGreenFile(file, {
        workers: DEFAULT_WORKERS,
        onUploadProgress: (percent) => {
          const scaledPercent = Math.max(1, Math.min(18, Math.round((percent / 90) * 18)));
          setProgressPercent(scaledPercent);
          setProgressLabel(`${t.uploadingFile} ${percent}%`);
        },
        onProgressEvent: handleProgressEvent,
      });
      setProgressPercent(100);
      setProgressLabel(t.importCompleted);
      const summaryParts = [
        typeof result.total_payloads === "number" ? t.payloadsLabel.replace("{count}", String(result.total_payloads)) : null,
        typeof result.unique_kids === "number" ? t.kidsLabel.replace("{count}", String(result.unique_kids)) : null,
        Array.isArray(result.failed_kids) ? t.failedLabel.replace("{count}", String(result.failed_kids.length)) : null,
        Array.isArray(result.item_results) ? t.itemsLabel.replace("{count}", String(result.item_results.length)) : null,
      ].filter(Boolean);

      showToast(
        summaryParts.length > 0 ? t.kidGreenImportCompletedSummary.replace("{summary}", summaryParts.join(", ")) : t.kidGreenImportCompleted,
        "success"
      );

      try {
        await onImported?.();
      } catch {
        showToast(t.inventoryRefreshNotAutomatic, "info");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t.kidGreenImportFailed;
      setProgressLabel(message);
      showToast(message, "error");
    } finally {
      window.setTimeout(() => {
        setIsImporting(false);
        setProgressPercent(0);
        setProgressLabel(null);
      }, 1200);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={(event) => void handleFileSelected(event)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isImporting}
        onClick={() => inputRef.current?.click()}
      >
        {isImporting ? <Loader2 className="animate-spin" /> : <Upload />}
        {t.importJson}
      </Button>

      {(isImporting || progressLabel)
        ? renderOverlay(
            <div className="pointer-events-none fixed right-3 top-3 z-[76] w-[min(88vw,18rem)] sm:right-4 sm:top-4">
              <div className="pointer-events-auto rounded-2xl border border-border/80 bg-background/95 px-3 py-3 shadow-[0_18px_36px_rgba(15,23,42,0.16)] backdrop-blur-md">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.kidGreenImport}</p>
                    <p className="truncate text-sm font-medium text-foreground">{selectedFileName ?? "kid_green.json"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">{progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.max(4, progressPercent)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{progressLabel ?? t.preparingImport}</p>
              </div>
            </div>
          )
        : null}
    </>
  );
}
