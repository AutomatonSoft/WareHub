import { useMemo, useState } from "react";
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

type Labels = Record<string, string>;

type ToastTone = "success" | "info" | "error";

type UseCreateProductControllerInput = {
  t: Labels;
  showToast: (message: string, tone: ToastTone) => void;
};

export function useCreateProductController(input: UseCreateProductControllerInput) {
  const { t, showToast } = input;

  const [selectedSites, setSelectedSites] = useState<string[]>([]);
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

  const orderedSites = useMemo(() => sortMarketplaceSitesByName(allMarketplaceSites), []);

  function toggleSite(siteId: string) {
    setSelectedSites((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
    );
  }

  function selectAllSites() {
    setSelectedSites(orderedSites.map((site) => site.id));
  }

  function clearAllSites() {
    setSelectedSites([]);
  }

  function resetFields() {
    setEan("");
    setPrice("");
    setProductName("");
    setImagesText("");
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

  async function handleCreateProduct() {
    if (selectedSites.length === 0) {
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
          selectedSiteIds: selectedSites
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
        selectedSiteIds: selectedSites
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
    toggleSite,
    selectAllSites,
    clearAllSites,
    resetFields,
    handleCreateProduct,
    loadJobStatus,
    loadReconciliationReports,
    loadReconciliationReportById
  };
}
