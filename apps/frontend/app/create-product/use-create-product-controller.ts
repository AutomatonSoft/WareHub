import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Operation } from "../../lib/api/generated/orchestrator-openapi-types";
import { allMarketplaceSites } from "../../lib/marketplace-sites";
import {
  xljvCreateAndPush,
  xljvUpdateByEan,
  xljvUploadImages,
} from "../../components/xljv/xljv-api";
import {
  createMainMarketplaceProductJob,
  createOrchestratorJob,
  getReconciliationReport,
  getOrchestratorJob,
  getOrchestratorJobAttempts,
  getOrchestratorJobEvents,
  listReconciliationReportsByEan,
  pushProductToOrchestrator
} from "./orchestrator-api";
import {
  buildMainKauflandCreatePayload,
  buildMainXljvCreatePayload,
  buildHoodCreatePayload,
  DEFAULT_MAIN_KAUFLAND_CREATE_FIELDS,
  DEFAULT_MAIN_XLJV_CREATE_FIELDS,
  DEFAULT_HOOD_CREATE_FIELDS,
  normalizeCreateProductInput,
  validateCreateProductInput,
  validateHoodCreateFields,
  validateMainKauflandCreateFields,
  validateMainXljvCreateFields,
  type CreateProductFieldKey,
  type HoodCreateFieldKey,
  type HoodCreateFields,
  type MainKauflandCreateFieldKey,
  type MainKauflandCreateFields,
  type MainXljvCreateFieldKey,
  type MainXljvCreateFields,
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
  CREATE_PRODUCT_XL_DEFAULT_SITE_KEY,
  fetchCreateProductSourceSitesByMainEan,
  fetchCreateProductSourceSnapshot,
  fetchCreateProductKidContext,
  type CreateProductSourceSiteKind,
  type CreateProductJvSourceSite,
  type CreateProductJvSourceSnapshot,
  type CreateProductKidContext,
} from "./create-product-source-api";

type Labels = Record<string, string>;

type ToastTone = "success" | "info" | "error";

type UseCreateProductControllerInput = {
  t: Labels;
  showToast: (message: string, tone: ToastTone) => void;
  sourceSite: CreateProductSourceSiteKind;
  preferredSourceSiteKey?: string;
};

type SourceCache = {
  sitesBySource: Map<string, CreateProductJvSourceSite[]>;
  snapshotsBySource: Map<string, CreateProductJvSourceSnapshot>;
  selectedSiteKeyBySource: Map<string, string>;
};

function sourceCacheKey(mainEan: string, sourceSite: CreateProductSourceSiteKind, siteKey = ""): string {
  return [mainEan.trim(), sourceSite, siteKey.trim()].join(":");
}

export function useCreateProductController(input: UseCreateProductControllerInput) {
  const { t, showToast, sourceSite, preferredSourceSiteKey = "" } = input;
  const searchParams = useSearchParams();

  const [selectedSites, setSelectedSites] = useState<string[]>(() => allMarketplaceSites.map((site) => site.id));
  const [sitesQuery, setSitesQuery] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [ean, setEan] = useState("");
  const [price, setPrice] = useState("");
  const [productName, setProductName] = useState("");
  const [imagesText, setImagesText] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [hoodFields, setHoodFields] = useState<HoodCreateFields>(DEFAULT_HOOD_CREATE_FIELDS);
  const [hoodFieldErrors, setHoodFieldErrors] = useState<Partial<Record<HoodCreateFieldKey, string>>>({});
  const [mainKauflandFields, setMainKauflandFields] = useState<MainKauflandCreateFields>(DEFAULT_MAIN_KAUFLAND_CREATE_FIELDS);
  const [mainKauflandFieldErrors, setMainKauflandFieldErrors] = useState<Partial<Record<MainKauflandCreateFieldKey, string>>>({});
  const [mainXljvFields, setMainXljvFields] = useState<MainXljvCreateFields>(DEFAULT_MAIN_XLJV_CREATE_FIELDS);
  const [mainXljvFieldErrors, setMainXljvFieldErrors] = useState<Partial<Record<MainXljvCreateFieldKey, string>>>({});
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
  const [loadedSourceSitesCacheKey, setLoadedSourceSitesCacheKey] = useState("");
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
  const sourceCacheRef = useRef<SourceCache>({
    sitesBySource: new Map(),
    snapshotsBySource: new Map(),
    selectedSiteKeyBySource: new Map(),
  });
  const prefetchedMainEansRef = useRef(new Set<string>());

  const orderedSites = useMemo(() => sortMarketplaceSitesByName(allMarketplaceSites), []);
  const sourceKidParam = searchParams.get("kid") ?? "";
  const sourceKidId = Number.parseInt(sourceKidParam, 10);

  const applySourceSnapshot = useCallback((snapshot: CreateProductJvSourceSnapshot, mainEan: string, site: CreateProductSourceSiteKind) => {
    setSourceSnapshot(snapshot);
    setEan(mainEan);
    setPrice(snapshot.price);
    setProductName(snapshot.productName);
    setImagesText(snapshot.imagesText);
    if (site === "HOOD") {
      setHoodFields((current) => ({
        ...current,
        ...(snapshot.description ? { description: snapshot.description } : {}),
        ...(snapshot.hoodFields?.quantity ? { quantity: snapshot.hoodFields.quantity } : {}),
        ...(snapshot.hoodFields?.condition ? { condition: snapshot.hoodFields.condition } : {}),
        ...(snapshot.hoodFields?.itemMode ? { itemMode: snapshot.hoodFields.itemMode } : {}),
        ...(snapshot.hoodFields?.itemNumber ? { itemNumber: snapshot.hoodFields.itemNumber } : {}),
        ...(snapshot.hoodFields?.productPropertiesText !== undefined
          ? { productPropertiesText: snapshot.hoodFields.productPropertiesText }
          : {}),
      }));
    }
    setPrefillSnapshot({
      ean: mainEan,
      price: snapshot.price,
      productName: snapshot.productName,
      imagesText: snapshot.imagesText,
    });
  }, []);

  const selectSourceSite = useCallback((siteKey: string) => {
    setSelectedSourceSiteKey(siteKey);
    if (kidContext?.mainEan) {
      sourceCacheRef.current.selectedSiteKeyBySource.set(
        sourceCacheKey(kidContext.mainEan, sourceSite),
        siteKey,
      );
    }
  }, [kidContext?.mainEan, sourceSite]);

  useEffect(() => {
    if (!Number.isFinite(sourceKidId) || sourceKidId <= 0) {
      setKidContext(null);
      setKidContextError(null);
      setKidContextLoading(false);
      setSourceSites([]);
      setSourceSitesError(null);
      setSourceSitesLoading(false);
      setLoadedSourceSitesCacheKey("");
      setSelectedSourceSiteKey("");
      setSourceSnapshot(null);
      setSourceSnapshotError(null);
      setSourceSnapshotLoading(false);
      setPrefillSnapshot(null);
      setImageFiles([]);
      sourceCacheRef.current.sitesBySource.clear();
      sourceCacheRef.current.snapshotsBySource.clear();
      sourceCacheRef.current.selectedSiteKeyBySource.clear();
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
        const message = normalizeCreateProductRuntimeError(error, t.failedLoadKidContext);
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
  }, [showToast, sourceKidId, t.failedLoadKidContext]);

  useEffect(() => {
    if (!kidContext?.mainEan) {
      setSourceSites([]);
      setSourceSitesError(null);
      setSourceSitesLoading(false);
      setLoadedSourceSitesCacheKey("");
      setSelectedSourceSiteKey("");
      return;
    }

    let active = true;
    const cacheKey = sourceCacheKey(kidContext.mainEan, sourceSite);
    const selectCachedSite = (sites: CreateProductJvSourceSite[]) => {
      setSelectedSourceSiteKey((current) => {
        const preferredSiteKey = preferredSourceSiteKey.trim();
        const rememberedSiteKey = sourceCacheRef.current.selectedSiteKeyBySource.get(cacheKey);
        const siteKey = [preferredSiteKey, rememberedSiteKey, current, sites[0]?.siteKey].find(
          (candidate): candidate is string => Boolean(candidate && sites.some((site) => site.siteKey === candidate)),
        ) ?? "";
        if (siteKey) sourceCacheRef.current.selectedSiteKeyBySource.set(cacheKey, siteKey);
        return siteKey;
      });
    };
    const cachedSites = sourceCacheRef.current.sitesBySource.get(cacheKey);
    if (cachedSites) {
      setSourceSites(cachedSites);
      setLoadedSourceSitesCacheKey(cacheKey);
      setSourceSitesError(null);
      setSourceSitesLoading(false);
      selectCachedSite(cachedSites);
      return () => {
        active = false;
      };
    }

    setSourceSitesLoading(true);
    setSourceSitesError(null);

    void fetchCreateProductSourceSitesByMainEan({ mainEan: kidContext.mainEan, site: sourceSite })
      .then((sites) => {
        if (!active) return;
        sourceCacheRef.current.sitesBySource.set(cacheKey, sites);
        setSourceSites(sites);
        setLoadedSourceSitesCacheKey(cacheKey);
        selectCachedSite(sites);
      })
      .catch((error) => {
        if (!active) return;
        const message = normalizeCreateProductRuntimeError(error, `Failed to load ${sourceSite} source sites.`);
        setSourceSites([]);
        setSourceSitesError(message);
        showToast(message, "error");
      })
      .finally(() => {
        if (active) setSourceSitesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [kidContext?.mainEan, preferredSourceSiteKey, showToast, sourceSite]);

  useEffect(() => {
    const mainEan = kidContext?.mainEan.trim() || "";
    if (!mainEan || prefetchedMainEansRef.current.has(mainEan)) {
      return;
    }

    prefetchedMainEansRef.current.add(mainEan);
    let active = true;
    const sourceKinds: CreateProductSourceSiteKind[] = ["JV", "XL", "HOOD", "KAUFLAND"];

    void Promise.allSettled(
      sourceKinds.map(async (site) => {
        try {
          const sites = await fetchCreateProductSourceSitesByMainEan({ mainEan, site });
          if (!active) return;

          sourceCacheRef.current.sitesBySource.set(sourceCacheKey(mainEan, site), sites);
          await Promise.allSettled(
            sites.map(async (sourceSite) => {
              const snapshot = await fetchCreateProductSourceSnapshot({
                mainEan,
                site,
                siteKey: sourceSite.siteKey,
              });
              if (active) {
                sourceCacheRef.current.snapshotsBySource.set(
                  sourceCacheKey(mainEan, site, sourceSite.siteKey),
                  snapshot,
                );
              }
            }),
          );
        } catch {
          // A marketplace can be unavailable without blocking the remaining tabs.
        }
      }),
    );

    return () => {
      active = false;
    };
  }, [kidContext?.mainEan]);

  useEffect(() => {
    const sourceSitesCacheKey = kidContext?.mainEan
      ? sourceCacheKey(kidContext.mainEan, sourceSite)
      : "";
    if (
      !kidContext?.mainEan
      || !selectedSourceSiteKey
      || loadedSourceSitesCacheKey !== sourceSitesCacheKey
    ) {
      setSourceSnapshot(null);
      setSourceSnapshotError(null);
      setSourceSnapshotLoading(false);
      return;
    }

    let active = true;
    const cacheKey = sourceCacheKey(kidContext.mainEan, sourceSite, selectedSourceSiteKey);
    const cachedSnapshot = sourceCacheRef.current.snapshotsBySource.get(cacheKey);
    if (cachedSnapshot) {
      applySourceSnapshot(cachedSnapshot, kidContext.mainEan, sourceSite);
      setSourceSnapshotError(null);
      setSourceSnapshotLoading(false);
      return () => {
        active = false;
      };
    }

    setSourceSnapshotLoading(true);
    setSourceSnapshotError(null);

    void fetchCreateProductSourceSnapshot({
      mainEan: kidContext.mainEan,
      site: sourceSite,
      siteKey: selectedSourceSiteKey,
    })
      .then((snapshot) => {
        if (!active) return;
        sourceCacheRef.current.snapshotsBySource.set(cacheKey, snapshot);
        applySourceSnapshot(snapshot, kidContext.mainEan, sourceSite);
      })
      .catch((error) => {
        if (!active) return;
        const message = normalizeCreateProductRuntimeError(error, `Failed to load ${sourceSite} source product.`);
        setSourceSnapshot(null);
        setSourceSnapshotError(message);
        showToast(message, "error");
      })
      .finally(() => {
        if (active) setSourceSnapshotLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applySourceSnapshot, kidContext?.mainEan, loadedSourceSitesCacheKey, selectedSourceSiteKey, showToast, sourceSite]);

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
    setImageFiles([]);
    setHoodFields(DEFAULT_HOOD_CREATE_FIELDS);
    setHoodFieldErrors({});
    setMainKauflandFields(DEFAULT_MAIN_KAUFLAND_CREATE_FIELDS);
    setMainKauflandFieldErrors({});
    setMainXljvFields(DEFAULT_MAIN_XLJV_CREATE_FIELDS);
    setMainXljvFieldErrors({});
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

  async function submitCreateProduct(
    siteIdsOverride?: string[],
    operation = Operation.update,
    additionalPayload?: Record<string, unknown>
  ) {
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
          selectedSiteIds: targetSiteIds,
          operation,
          additionalPayload,
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
        selectedSiteIds: targetSiteIds,
        operation,
        additionalPayload,
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

  async function handleCreateProduct(xljvOverrides: Record<string, unknown> = {}) {
    if (!validateCreateFields()) {
      showToast(t.fixFormErrorsBeforeCreate, "error");
      return;
    }
    const hoodErrors = validateHoodCreateFields(hoodFields);
    const kauflandErrors = validateMainKauflandCreateFields(mainKauflandFields);
    const xljvErrors = validateMainXljvCreateFields(mainXljvFields);
    setHoodFieldErrors(hoodErrors);
    setMainKauflandFieldErrors(kauflandErrors);
    setMainXljvFieldErrors(xljvErrors);
    if (Object.keys(hoodErrors).length > 0 || Object.keys(kauflandErrors).length > 0 || Object.keys(xljvErrors).length > 0) {
      showToast("Correct the highlighted marketplace fields before creating the job.", "error");
      return;
    }

    const normalized = normalizeCreateProductInput({ ean, price, productName, imagesText });
    if (normalized.imageUrls.length === 0) {
      showToast("Provide at least one image URL before creating the marketplace job.", "error");
      return;
    }
    const hoodPayload = buildHoodCreatePayload({ ean: normalized.ean, fields: hoodFields });
    const baseXljvPayload = buildMainXljvCreatePayload({ ean: normalized.ean, fields: mainXljvFields });
    const baseJvFields =
      baseXljvPayload.jv_fields && typeof baseXljvPayload.jv_fields === "object"
        ? (baseXljvPayload.jv_fields as Record<string, unknown>)
        : {};
    const overrideJvFields =
      xljvOverrides.jv_fields && typeof xljvOverrides.jv_fields === "object"
        ? (xljvOverrides.jv_fields as Record<string, unknown>)
        : {};
    const xljvPayload = {
      ...baseXljvPayload,
      ...xljvOverrides,
      jv_fields: {
        ...baseJvFields,
        ...overrideJvFields,
      },
    };
    const kauflandPayload = {
      ...buildMainKauflandCreatePayload({
        ean: normalized.ean,
        imageUrls: normalized.imageUrls,
        description: hoodFields.description,
        fields: mainKauflandFields,
      }),
      price: normalized.price,
    };

    setSubmitting(true);
    try {
      const created = await createMainMarketplaceProductJob({
        ean: normalized.ean,
        productName: normalized.productName,
        description: hoodFields.description.trim(),
        price: normalized.price,
        imageUrls: normalized.imageUrls,
        xljvPayload,
        hoodPayload,
        kauflandPayload,
      });
      setLatestJobId(created.jobId);
      showToast(`${t.orchestratorJobCreated}: ${created.jobId}`, "success");
    } catch (error) {
      showToast(normalizeCreateProductRuntimeError(error, t.failedPushProductToOrchestrator), "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateProductForSiteIds(siteIds: string[]) {
    await submitCreateProduct(siteIds);
  }

  async function handleCreateProductForHoodSiteIds(siteIds: string[]) {
    const hoodErrors = validateHoodCreateFields(hoodFields);
    setHoodFieldErrors(hoodErrors);
    if (Object.keys(hoodErrors).length > 0) {
      showToast("Complete the required Hood fields before publishing.", "error");
      return;
    }

    const normalized = normalizeCreateProductInput({ ean, price, productName, imagesText });
    await submitCreateProduct(siteIds, Operation.publish, buildHoodCreatePayload({ ean: normalized.ean, fields: hoodFields }));
  }

  async function handleCreateProductForXlDefaultSite() {
    if (!validateCreateFields()) {
      showToast(t.fixFormErrorsBeforeCreate, "error");
      return;
    }

    const normalized = normalizeCreateProductInput({ ean, price, productName, imagesText });
    const defaultSiteKey = CREATE_PRODUCT_XL_DEFAULT_SITE_KEY;

    setSubmitting(true);
    try {
      let uploadedUrls: string[] = [];
      if (imageFiles.length > 0 || normalized.imageUrls.length > 0) {
        const uploadResult = await xljvUploadImages({
          site: "XL",
          siteKey: defaultSiteKey,
          ean: normalized.ean,
          files: imageFiles,
          sourceUrls: imageFiles.length === 0 ? normalized.imageUrls : [],
        });
        if (!uploadResult.response.ok) {
          throw new Error(
            String(uploadResult.payload.detail || `XL image upload failed: HTTP ${uploadResult.response.status}`),
          );
        }
        uploadedUrls = Array.isArray(uploadResult.payload.uploaded_image_urls)
          ? uploadResult.payload.uploaded_image_urls
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          : [];
      }

      const payload: Record<string, unknown> = {
        ean: normalized.ean,
        source_model: normalized.ean,
        source_ean_field: normalized.ean,
        price: normalized.price,
        quantity: 0,
        status: true,
        image: uploadedUrls[0] || undefined,
        images: uploadedUrls.slice(1).map((url, index) => ({ image: url, sort_order: index })),
        descriptions: [
          {
            language_id: 1,
            name: normalized.productName,
            description: normalized.productName,
            tag: "",
            meta_title: normalized.productName,
            meta_description: normalized.productName,
            meta_keyword: "",
          },
        ],
      };

      const createResult = await xljvCreateAndPush({
        site: "XL",
        siteKey: defaultSiteKey,
        payload,
      });
      if (!createResult.response.ok) {
        if (String(createResult.payload.code || "") === "xl_create_ean_conflict") {
          const updateResult = await xljvUpdateByEan({
            ean: normalized.ean,
            site: "XL",
            siteKey: defaultSiteKey,
            payload,
          });
          if (!updateResult.response.ok) {
            throw new Error(
              String(updateResult.payload.detail || `XL update failed: HTTP ${updateResult.response.status}`),
            );
          }
          showToast(`XL DE product updated: ${normalized.ean}`, "success");
          return;
        }
        throw new Error(
          String(createResult.payload.detail || `XL create failed: HTTP ${createResult.response.status}`),
        );
      }

      showToast(`XL DE product created: ${normalized.ean}`, "success");
    } catch (error) {
      showToast(normalizeCreateProductRuntimeError(error, "Failed to create XL DE product."), "error");
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
    imageFiles,
    hoodFields,
    hoodFieldErrors,
    mainKauflandFields,
    mainKauflandFieldErrors,
    mainXljvFields,
    mainXljvFieldErrors,
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
    setImageFiles,
    setHoodFields,
    setMainKauflandFields,
    setMainXljvFields,
    setFieldErrors,
    setUseControlledJob,
    setLatestJobId,
    setReconciliationReportId,
    selectSourceSite,
    toggleSite,
    selectAllSites,
    clearAllSites,
    resetFields,
    handleCreateProduct,
    handleCreateProductForSiteIds,
    handleCreateProductForHoodSiteIds,
    handleCreateProductForXlDefaultSite,
    loadJobStatus,
    loadReconciliationReports,
    loadReconciliationReportById
  };
}
