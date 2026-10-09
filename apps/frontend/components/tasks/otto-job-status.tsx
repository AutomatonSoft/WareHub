"use client";

import { useState } from "react";
import { useLanguage } from "../../app/use-labels";
import { fetchOttoJobStatus, type OttoJob, type OttoJobStatus } from "../../lib/api/otto-job-status";
import { Button } from "../ui/button";

export function OttoJobStatusButton({ job }: { job: OttoJob }) {
  const language = useLanguage();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<OttoJobStatus | null>(null);
  const [error, setError] = useState("");
  const check = async () => {
    setLoading(true);
    setError("");
    setStatus(null);
    try { setStatus(await fetchOttoJobStatus(job)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "OTTO status unavailable"); }
    finally { setLoading(false); }
  };
  const note = language === "ru"
    ? "Это результат обработки OTTO, а не подтверждение публикации на сайте."
    : language === "de" ? "OTTO-Verarbeitungsergebnis, keine Bestätigung der Veröffentlichung."
      : "OTTO processing result, not confirmation that the listing is live.";
  const rejected = (status?.failed ?? 0) > 0 || String(status?.state).toLowerCase() === "failed" || (Array.isArray(status?.failures) && status.failures.length > 0);
  const eanLabel = language === "ru" ? "Отправленный EAN" : language === "de" ? "Gesendete EAN" : "Submitted EAN";
  return <div className="flex min-w-0 flex-col gap-1 text-xs">
    <p className="break-words text-muted-foreground">KID: {job.kidNumber || "—"} · {eanLabel}: {job.ean || "—"}{job.skus?.length ? ` · SKU: ${job.skus.join(", ")}` : ""}</p>
    <Button type="button" variant="link" size="sm" className="h-auto max-w-full justify-start whitespace-normal break-all p-0 text-left" disabled={loading} onClick={() => void check()}>
      OTTO {job.controller.toUpperCase()} Job ID: {job.jobId}{loading ? " …" : ""}
    </Button>
    <div aria-live="polite" aria-busy={loading}>
      {error ? <p role="alert" className="text-destructive">{error}</p> : null}
      {status ? <div className={rejected ? "text-destructive" : "text-foreground"}>
        <p>OTTO: {status.state || "UNKNOWN"} · total: {status.total ?? "—"} · progress: {status.progress ?? "—"} · succeeded: {status.succeeded ?? "—"} · failed: {status.failed ?? "—"} · unchanged: {status.unchanged ?? "—"}</p>
        {status.message ? <p>{status.message}</p> : null}
        {status.failures != null ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(status.failures, null, 2)}</pre> : null}
        <p className="text-muted-foreground">{note}</p>
      </div> : null}
    </div>
  </div>;
}
