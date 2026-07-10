"use client";

import { useEffect, useMemo, useState } from "react";
import { useLabels } from "../../app/use-labels";
import { createOrchestratorJob } from "../../app/create-product/orchestrator-api";
import { parseSiteIdsInput } from "../../app/create-product/site-ids-input-model";
import { Button } from "../shared/button";
import { Card } from "../shared/card";
import { Input } from "../shared/input";
import { Textarea } from "../shared/textarea";
import { useToast } from "../shared/toast-provider";
import { fetchEanPoolStatsCount, importEansToPool, reserveEan, takeNextFreeEan } from "./ean-pool-api";
import { isEan13, normalizeEanInputLines } from "./ean-input-model";

export function ProductFormPanel() {
  const t = useLabels();
  const { showToast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({
    title: "",
    description: "",
    sku: "",
    ean: "",
    category: "",
    dimensions: "",
    weight: "",
    stock: "",
    price: "",
    marketplaceMapping: "",
    variants: "",
    seoFields: ""
  });
  const fields: Array<{ key: string; label: string }> = [
    { key: "title", label: t.title },
    { key: "description", label: t.description },
    { key: "sku", label: t.sku },
    { key: "ean", label: t.ean },
    { key: "category", label: t.category },
    { key: "dimensions", label: t.dimensions },
    { key: "weight", label: t.weight },
    { key: "stock", label: t.stock },
    { key: "price", label: t.price },
    { key: "marketplaceMapping", label: t.marketplaceMapping },
    { key: "variants", label: t.variants },
    { key: "seoFields", label: t.seoFields }
  ];

  const [isEanModalOpen, setIsEanModalOpen] = useState(false);
  const [eanInput, setEanInput] = useState("");
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [importing, setImporting] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [eanActionLoading, setEanActionLoading] = useState(false);
  const [jobSiteIdsText, setJobSiteIdsText] = useState("");
  const [jobCreating, setJobCreating] = useState(false);
  const [latestUpdateJobId, setLatestUpdateJobId] = useState("");

  const requiredFieldKeys = ["title", "description", "sku", "ean", "category", "stock", "price"] as const;
  const missingRequired = requiredFieldKeys.filter((key) => !form[key]?.trim());
  const completenessPercent = Math.round(((requiredFieldKeys.length - missingRequired.length) / requiredFieldKeys.length) * 100);

  const normalizedEans = useMemo(
    () => normalizeEanInputLines(eanInput),
    [eanInput]
  );

  async function loadPoolStats() {
    setLoadingStats(true);
    try {
      const count = await fetchEanPoolStatsCount();
      setPoolCount(count);
    } catch {
      setPoolCount((prev) => prev);
    } finally {
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    void loadPoolStats();
  }, []);

  async function handleImportEans() {
    if (normalizedEans.length === 0 || importing) {
      return;
    }
    setImporting(true);
    setStatusText("");
    try {
      const { response, importedCount, errorText } = await importEansToPool(normalizedEans);
      if (!response.ok) {
        const message = `${t.importFailed}: HTTP ${response.status}${errorText ? ` - ${errorText}` : ""}`;
        setStatusText(message);
        showToast(message, "error");
        return;
      }
      const message = `${t.imported} ${importedCount} ${t.eanImportedSuffix}`;
      setStatusText(message);
      showToast(message, "success");
      setEanInput("");
      setPoolCount((prev) => (typeof prev === "number" ? prev + importedCount : prev));
      await loadPoolStats();
    } catch (error) {
      const message = error instanceof Error ? `${t.importTimeoutError}: ${error.message}` : t.importTimeoutError;
      setStatusText(message);
      showToast(message, "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleReserveCurrentEan() {
    const ean = form.ean.trim();
    if (!ean) {
      setStatusText(t.reserveEanInputRequired);
      return;
    }
    if (!isEan13(ean)) {
      setStatusText(t.reserveEanMustBe13Digits);
      return;
    }
    if (eanActionLoading) {
      return;
    }
    setEanActionLoading(true);
    try {
      const { response, errorText } = await reserveEan(ean);
      if (!response.ok) {
        setStatusText(`${t.reserveEanFailed} HTTP ${response.status}${errorText ? ` - ${errorText}` : ""}`);
        return;
      }
      setStatusText(t.eanReservedInPool.replace("{ean}", ean));
      await loadPoolStats();
    } finally {
      setEanActionLoading(false);
    }
  }

  async function handleTakeNextEan() {
    if (eanActionLoading) {
      return;
    }
    setEanActionLoading(true);
    try {
      const { response, ean, errorText } = await takeNextFreeEan();
      if (!response.ok || !ean) {
        setStatusText(`${t.takeNextEanFailed} HTTP ${response.status}${errorText ? ` - ${errorText}` : ""}`);
        return;
      }
      setForm((current) => ({ ...current, ean }));
      setStatusText(t.nextFreeEanAssigned.replace("{ean}", ean));
      await loadPoolStats();
    } finally {
      setEanActionLoading(false);
    }
  }

  async function handleCreateControlledUpdateJob() {
    const siteIds = parseSiteIdsInput(jobSiteIdsText);
    if (siteIds.length === 0) {
      showToast(t.selectAtLeastOneMarketplaceSite, "error");
      return;
    }
    const ean = form.ean.trim();
    const productName = form.title.trim() || form.sku.trim();
    const price = form.price.trim();

    if (!isEan13(ean)) {
      showToast(t.validationEanExact13Digits, "error");
      return;
    }
    if (!productName) {
      showToast(t.validationProductNameMin3, "error");
      return;
    }
    if (!/^\d+([.,]\d{1,2})?$/.test(price)) {
      showToast(t.validationPriceNumeric, "error");
      return;
    }

    setJobCreating(true);
    try {
      const created = await createOrchestratorJob({
        ean,
        productName,
        price: price.replace(",", "."),
        imageUrls: [],
        selectedSiteIds: siteIds
      });
      setLatestUpdateJobId(created.jobId);
      showToast(`${t.orchestratorJobCreated}: ${created.jobId}`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : t.failedPrepareCreateForm;
      showToast(message, "error");
    } finally {
      setJobCreating(false);
    }
  }

  return (
    <Card className="h-full p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="page-title text-lg">{t.productInformation}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl bg-[color:rgba(129,135,255,0.1)] px-3 py-2 text-sm font-semibold text-[color:var(--text-primary)]">
            {loadingStats ? "..." : (poolCount ?? "-")}
          </span>
          <Button variant="secondary" onClick={() => void loadPoolStats()} disabled={loadingStats}>
            {t.refreshEan}
          </Button>
          <Button variant="secondary" onClick={() => setIsEanModalOpen(true)}>
            {t.addEan}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="ui-form-field">
            <span className="ui-form-label">{field.label}</span>
            <Input
              className="bg-[color:rgba(129,135,255,0.08)]"
              placeholder={`${t.enter} ${field.label.toLowerCase()}`}
              value={form[field.key] ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          </label>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-[color:var(--outline)] p-3 text-sm">
        <div className="font-semibold">{t.completenessScore}: {completenessPercent}%</div>
        <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
          {missingRequired.length === 0 ? t.allRequiredFieldsFilled : `${t.readinessMissing}: ${missingRequired.join(", ")}`}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button>{t.save}</Button>
        <Button variant="secondary">{t.publish}</Button>
        <Button variant="secondary">{t.pushToMarketplaces}</Button>
        <Button variant="secondary" onClick={() => void handleTakeNextEan()} disabled={eanActionLoading}>
          {t.takeNextEan}
        </Button>
        <Button variant="secondary" onClick={() => void handleReserveCurrentEan()} disabled={eanActionLoading}>
          {t.reserveDraftEan}
        </Button>
      </div>
      <div className="mt-4 rounded-xl border border-[color:var(--outline)] p-3">
        <div className="text-sm font-semibold">{t.createUpdateJobFromEditor}</div>
        <div className="mt-2 grid gap-2">
          <label className="ui-form-field">
            <span className="ui-form-label">{t.targetSiteIds}</span>
            <Textarea
              value={jobSiteIdsText}
              onChange={(event) => setJobSiteIdsText(event.target.value)}
              className="min-h-[96px] bg-[color:rgba(129,135,255,0.08)]"
              placeholder={`hood-de\nkaufland-de`}
            />
            <span className="text-xs text-[color:var(--text-muted)]">{t.oneSiteIdPerLine}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => void handleCreateControlledUpdateJob()} loading={jobCreating}>
              {t.createUpdateJob}
            </Button>
            {latestUpdateJobId ? <span className="text-xs text-[color:var(--text-secondary)]">job_id: {latestUpdateJobId}</span> : null}
          </div>
        </div>
      </div>

      {isEanModalOpen ? (
        <div className="ui-backdrop-fade ui-modal-backdrop" role="presentation" onClick={() => setIsEanModalOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.eanPoolImport}
            className="ui-modal-enter ui-modal-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ui-modal-header">
              <h4 className="page-title text-base">{t.eanPoolImport}</h4>
              <span className="text-xs text-[color:var(--text-muted)]">
                {loadingStats ? `${t.count}: ...` : `${t.count}: ${poolCount ?? "-"}`}
              </span>
            </div>
            <div className="ui-modal-body">
            <Textarea
              value={eanInput}
              onChange={(event) => setEanInput(event.target.value)}
              className="mt-3 min-h-[200px] bg-[color:rgba(129,135,255,0.08)]"
              placeholder={"4006381333931\n4006381333932\n4006381333933"}
            />
            </div>
            <div className="ui-modal-footer !justify-start">
              <Button onClick={handleImportEans} loading={importing} disabled={normalizedEans.length === 0}>{t.uploadEanList}</Button>
              <Button variant="secondary" onClick={() => setIsEanModalOpen(false)}>
                {t.close}
              </Button>
              <span className="text-xs text-[color:var(--text-muted)]">{t.rows}: {normalizedEans.length}</span>
            </div>
            {statusText ? <p className="ui-status-banner ui-status-info mt-2 text-xs">{statusText}</p> : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
