import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { allMarketplaceSites } from "../../lib/marketplace-sites";
import {
  createOrchestratorJob,
  getReconciliationReport,
  getOrchestratorJob,
  getOrchestratorJobAttempts,
  getOrchestratorJobEvents,
  listReconciliationReportsByEan,
  pushProductToOrchestrator
} from "./orchestrator-api";
import {
  normalizeCreateProductInput,
  validateCreateProductInput,
  type CreateProductFieldKey
} from "./create-product-model";
import { normalizeJobId, parseJobEventsSummary } from "./job-status-model";
import { buildJobStatusDetails } from "./job-status-details-model";
import { buildFailureSummary } from "./orchestrator-result-model";
import { filterMarketplaceSites, sortMarketplaceSitesByName } from "./site-filter-model";
import {
  buildOrchestratorStatusToastMessage,
  mapValidationErrorCodeToLabel
} from "./create-product-controller-model";
import { normalizeCreateProductRuntimeError } from "./create-product-api-errors";
import {
  fetchCreateProductJvSitesByMainEan,
  fetchCreateProductJvSourceSnapshot,
  fetchCreateProductKidContext,
  type CreateProductJvSourceSite,
  type CreateProductJvSourceSnapshot,
  type CreateProductKidContext,
} from "./create-product-source-api";

type Labels = Record<string, string>;

type ToastTone = "success" | "info" | "error";

type UseCreateProductControllerInput = {
  t: Labels;
  showToast: (message: string, tone: ToastTone) => void;
};

export function useCreateProductController(input: UseCreateProductControllerInput) {
  const { t, showToast } = input;
  const searchParams = useSearchParams();

  const [selectedSites, setSelectedSites] = useState<string[]>(() => allMarketplaceSites.map((site) => site.id));
  const [sitesQuery, setSitesQuery] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [ean, setEan] = useState("");
  const [price, setPrice] = useState("");
  const [productName, setProductName] = useState("");
  const [imagesText, setImagesText] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CreateProductFieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [useControlledJob, setUseControlledJob] = useState(true);
  const [latestJobId, setLatestJobId] = useState("");
  const [jobStatusJson, setJobStatusJson] = useState("");
  const [jobAttemptsJson, setJobAttemptsJson] = useState("");
  const [jobEventsJson, setJobEventsJson] = useState("");
  const [reconciliationReportId, setReconciliationReportId] = useState("");
  const [reconciliationReportsJson, setReconciliationReportsJson] = useState("");
  const [reconciliationReportJson, setReconciliationReportJson] = useState("");
  const [kidContext, setKidContext] = useState<CreateProductKidContext | null>(null);
  const [kidContextLoading, setKidContextLoading] = useState(false);
  const [kidContextError, setKidContextError] = useState<string | null>(null);
  const [sourceSites, setSourceSites] = useState<CreateProductJvSourceSite[]>([]);
  const [sourceSitesLoading, setSourceSitesLoading] = useState(false);
  const [sourceSitesError, setSourceSitesError] = useState<string | null>(null);
  const [selectedSourceSiteKey, setSelectedSourceSiteKey] = useState("");
  const [sourceSnapshot, setSourceSnapshot] = useState<CreateProductJvSourceSnapshot | null>(null);
  const [sourceSnapshotLoading, setSourceSnapshotLoading] = useState(false);
  const [sourceSnapshotError, setSourceSnapshotError] = useState<string | null>(null);
  const [prefillSnapshot, setPrefillSnapshot] = useState<{
    ean: string;
    price: string;
    productName: string;
    imagesText: string;
  } | null>(null);

  const orderedSites = useMemo(() => sortMarketplaceSitesByName(allMarketplaceSites), []);
  const sourceKidParam = searchParams.get("kid") ?? "";
  const sourceKidId = Number.parseInt(sourceKidParam, 10);

  useEffect(() => {
    if (!Number.isFinite(sourceKidId) || sourceKidId <= 0) {
      setKidContext(null);
      setKidContextError(null);
      setKidContextLoading(false);
      setSourceSites([]);
      setSourceSitesError(null);
      setSourceSitesLoading(false);
      setSelectedSourceSiteKey("");
      setSourceSnapshot(null);
      setSourceSnapshotError(null);
      setSourceSnapshotLoading(false);
      setPrefillSnapshot(null);
      return;
    }

    let active = true;
    setKidContextLoading(true);
    setKidContextError(null);

    void fetchCreateProductKidContext(sourceKidId)
      .then((context) => {
        if (!active) return;
        setKidContext(context);
      })
      .catch((error) => {
        if (!active) return;
        const message = normalizeCreateProductRuntimeError(error, "Failed to load kid context.");
        setKidContext(null);
        setKidContextError(message);
        showToast(message, "error");
      })
      .finally(() => {
        if (active) setKidContextLoading(false);
      });

    return () => {
      active = false;
    };
  }, [showToast, sourceKidId]);

  useEffect(() => {
    if (!kidContext?.mainEan) {
      setSourceSites([]);
      setSourceSitesError(null);
      setSourceSitesLoading(false);
      setSelectedSourceSiteKey("");
      return;
    }

    let active = true;
    setSourceSitesLoading(true);
    setSourceSitesError(null);

    void fetchCreateProductJvSitesByMainEan(kidContext.mainEan)
      .then((sites) => {
        if (!active) return;
        setSourceSites(sites);
        setSelectedSourceSiteKey((current) => {
          if (current && sites.some((site) => site.siteKey === current)) return current;
          return sites[0]?.siteKey ?? "";
        });
      })
      .catch((error) => {
        if (!active) return;
        setSourceSites([]);
        setSourceSitesError(normalizeCreateProductRuntimeError(error, "Failed to load JV source sites."));
      })
      .finally(() => {
        if (active) setSourceSitesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [kidContext?.mainEan]);

  useEffect(() => {
    if (!kidContext?.mainEan || !selectedSourceSiteKey) {
      setSourceSnapshot(null);
      setSourceSnapshotError(null);
      setSourceSnapshotLoading(false);
      return;
    }

    let active = true;
    setSourceSnapshotLoading(true);
    setSourceSnapshotError(null);

    void fetchCreateProductJvSourceSnapshot({
      mainEan: kidContext.mainEan,
      siteKey: selectedSourceSiteKey,
    })
      .then((snapshot) => {
        if (!active) return;
        setSourceSnapshot(snapshot);
        setEan(kidContext.mainEan);
        setPrice(snapshot.price);
        setProductName(snapshot.productName);
        setImagesText(snapshot.imagesText);
        setPrefillSnapshot({
          ean: kidContext.mainEan,
          price: snapshot.price,
          productName: snapshot.productName,
          imagesText: snapshot.imagesText,
        });
      })
      .catch((error) => {
        if (!active) return;
        setSourceSnapshot(null);
        setSourceSnapshotError(normalizeCreateProductRuntimeError(error, "Failed to load JV source product."));
      })
      .finally(() => {
        if (active) setSourceSnapshotLoading(false);
      });

    return () => {
      active = false;
    };
  }, [kidContext?.mainEan, selectedSourceSiteKey]);

  function toggleSite(siteId: string) {
    setSelectedSites((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
    );
  }

  function selectAllSites() {
    setSelectedSites(orderedSites.map((site) => site.id));
  }

  function clearAllSites() {
    setSelectedSites(allMarketplaceSites.map((site) => site.id));
  }

  function resetFields() {
    if (prefillSnapshot) {
      setEan(prefillSnapshot.ean);
      setPrice(prefillSnapshot.price);
      setProductName(prefillSnapshot.productName);
      setImagesText(prefillSnapshot.imagesText);
    } else {
      setEan("");
      setPrice("");
      setProductName("");
      setImagesText("");
    }
    setFieldErrors({});
    showToast(t.fieldsReset, "info");
  }

  function validateCreateFields(): boolean {
    const validation = validateCreateProductInput({ ean, price, productName, imagesText });
    const mappedErrors: Partial<Record<CreateProductFieldKey, string>> = {};
    if (validation.errors.ean) {
      mappedErrors.ean = mapValidationErrorCodeToLabel(validation.errors.ean, t);
    }
    if (validation.errors.price) {
      mappedErrors.price = mapValidationErrorCodeToLabel(validation.errors.price, t);
    }
    if (validation.errors.productName) {
      mappedErrors.productName = mapValidationErrorCodeToLabel(validation.errors.productName, t);
    }
    setFieldErrors(mappedErrors);
    return validation.isValid;
  }

  async function submitCreateProduct(siteIdsOverride?: string[]) {
    const targetSiteIds = Array.isArray(siteIdsOverride) ? siteIdsOverride : selectedSites;
    if (targetSiteIds.length === 0) {
      showToast(t.selectAtLeastOneMarketplaceSite, "error");
      return;
    }
    if (!validateCreateFields()) {
      showToast(t.fixFormErrorsBeforeCreate, "error");
      return;
    }

    const normalized = normalizeCreateProductInput({ ean, price, productName, imagesText });

    setSubmitting(true);
    try {
      if (useControlledJob) {
        const created = await createOrchestratorJob({
          ean: normalized.ean,
          price: normalized.price,
          productName: normalized.productName,
          imageUrls: normalized.imageUrls,
          selectedSiteIds: targetSiteIds
        });
        setLatestJobId(created.jobId);
        showToast(`${t.orchestratorJobCreated}: ${created.jobId}`, "success");
        return;
      }

      const result = await pushProductToOrchestrator({
        ean: normalized.ean,
        price: normalized.price,
        productName: normalized.productName,
        imageUrls: normalized.imageUrls,
        selectedSiteIds: targetSiteIds
      });

      const failedCount = result.results.filter((item) => item.status === "failed").length;
      const failureSummary = buildFailureSummary(result.results);
      const toast = buildOrchestratorStatusToastMessage({
        labels: t,
        status: result.status,
        totalResults: result.results.length,
        failedCount,
        failureSummary
      });
      showToast(toast.message, toast.tone);
    } catch (error) {
      const message = normalizeCreateProductRuntimeError(error, t.failedPushProductToOrchestrator);
      showToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateProduct() {
    await submitCreateProduct();
  }

  async function handleCreateProductForSiteIds(siteIds: string[]) {
    await submitCreateProduct(siteIds);
  }

  async function loadJobStatus() {
    const normalizedJobId = normalizeJobId(latestJobId);
    if (!normalizedJobId) {
      showToast(t.enterJobIdFirst, "error");
      return;
    }
    try {
      const [job, attempts, events] = await Promise.all([
        getOrchestratorJob(normalizedJobId),
        getOrchestratorJobAttempts(normalizedJobId),
        getOrchestratorJobEvents(normalizedJobId)
      ]);
      setJobStatusJson(JSON.stringify(job, null, 2));
      setJobAttemptsJson(JSON.stringify(attempts, null, 2));
      setJobEventsJson(JSON.stringify(events, null, 2));
    } catch (error) {
      showToast(normalizeCreateProductRuntimeError(error, t.failedLoadJobStatus), "error");
    }
  }

  async function loadReconciliationReports() {
    const normalizedEan = ean.trim();
    if (!normalizedEan) {
      showToast(t.enterEan, "error");
      return;
    }
    try {
      const listPayload = await listReconciliationReportsByEan(normalizedEan);
      setReconciliationReportsJson(JSON.stringify(listPayload, null, 2));

      const rows = Array.isArray((listPayload as { reports?: unknown[] }).reports)
        ? ((listPayload as { reports?: unknown[] }).reports as unknown[])
        : [];
      const first = rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null
        ? (rows[0] as Record<string, unknown>)
        : null;
      const firstReportIdRaw = first?.report_id ?? first?.id;
      const firstReportId = typeof firstReportIdRaw === "string" ? firstReportIdRaw : "";
      if (firstReportId) {
        setReconciliationReportId(firstReportId);
        const detail = await getReconciliationReport(firstReportId);
        setReconciliationReportJson(JSON.stringify(detail, null, 2));
      }
    } catch (error) {
      showToast(normalizeCreateProductRuntimeError(error, t.failedLoadReconciliationReports), "error");
    }
  }

  async function loadReconciliationReportById() {
    const reportId = normalizeJobId(reconciliationReportId);
    if (!reportId) {
      showToast(t.enterReconciliationReportIdFirst, "error");
      return;
    }
    try {
      const detail = await getReconciliationReport(reportId);
      setReconciliationReportJson(JSON.stringify(detail, null, 2));
    } catch (error) {
      showToast(normalizeCreateProductRuntimeError(error, t.failedLoadReconciliationReport), "error");
    }
  }

  const reconciliationSummary = useMemo(() => {
    const summary = parseJobEventsSummary(jobEventsJson);
    if (!summary) return "";
    return `${t.events}: ${summary.totalEvents}, ${t.failedErrorEvents}: ${summary.failedOrErrorEvents}`;
  }, [jobEventsJson, t]);

  const visibleSites = useMemo(() => {
    return filterMarketplaceSites({
      sites: orderedSites,
      query: sitesQuery,
      showSelectedOnly,
      selectedSiteIds: selectedSites
    });
  }, [orderedSites, selectedSites, showSelectedOnly, sitesQuery]);

  const jobStatusDetails = useMemo(
    () =>
      buildJobStatusDetails({
        latestJobId,
        jobStatusJson,
        jobAttemptsJson,
        jobEventsJson
      }),
    [latestJobId, jobStatusJson, jobAttemptsJson, jobEventsJson]
  );

  return {
    selectedSites,
    sitesQuery,
    showSelectedOnly,
    ean,
    price,
    productName,
    imagesText,
    fieldErrors,
    submitting,
    useControlledJob,
    latestJobId,
    jobStatusJson,
    jobAttemptsJson,
    jobEventsJson,
    reconciliationReportId,
    reconciliationReportsJson,
    reconciliationReportJson,
    jobStatusDetails,
    reconciliationSummary,
    kidContext,
    kidContextLoading,
    kidContextError,
    sourceSites,
    sourceSitesLoading,
    sourceSitesError,
    selectedSourceSiteKey,
    sourceSnapshot,
    sourceSnapshotLoading,
    sourceSnapshotError,
    visibleSites,
    setSitesQuery,
    setShowSelectedOnly,
    setEan,
    setPrice,
    setProductName,
    setImagesText,
    setFieldErrors,
    setUseControlledJob,
    setLatestJobId,
    setReconciliationReportId,
    setSelectedSourceSiteKey,
    toggleSite,
    selectAllSites,
    clearAllSites,
    resetFields,
    handleCreateProduct,
    handleCreateProductForSiteIds,
    loadJobStatus,
    loadReconciliationReports,
    loadReconciliationReportById
  };
}
