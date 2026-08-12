import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Operation } from "../../lib/api/generated/orchestrator-openapi-types";
import { allMarketplaceSites } from "../../lib/marketplace-sites";
import {
  xljvCreateAndPush,
  xljvUpdateByEan,
  xljvUploadImages,
} from "../../components/xljv/xljv-api";
import { toXljvImageUrl } from "../../components/xljv/xljv-image-utils";
import { patchHoodByEan } from "../../components/hood/hood-api";
import type { HoodAccount } from "../../components/hood/hood-search-utils";
import { uploadKauflandImages } from "../../components/channels/kaufland-api";
import {
  createMainMarketplaceProductJob,
  createOrchestratorJob,
  getReconciliationReport,
  getOrchestratorJob,
  getOrchestratorJobAttempts,
  getOrchestratorJobEvents,
  listReconciliationReportsByEan,
  pushProductToOrchestrator,
  type OrchestratorResponse,
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
  type CreateProductFormInput,
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

function normalizeKauflandImageUrls(imageUrls: string[]): string[] {
  return Array.from(new Set(imageUrls
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => {
      if (/^(https?:)?\/\//i.test(value)) return value;
      return value.startsWith("cosmoshop/")
        ? toXljvImageUrl("JV", "JV_DE", value)
        : toXljvImageUrl("XL", CREATE_PRODUCT_XL_DEFAULT_SITE_KEY, value);
    })));
}

export type XlPublishDraft = {
  name: string;
  ean: string;
  price: string;
  manufacturer_id: string;
  description: string;
  tag: string;
  meta_title: string;
  meta_description: string;
  meta_keyword: string;
};

export type HoodPublishDraft = {
  name: string;
  ean: string;
  price: string;
  fields: HoodCreateFields;
};

export type CreateProductSourceDiscoveryStatus = "loading" | "found" | "missing" | "error";

export type CreateProductSourceDiscovery = {
  status: CreateProductSourceDiscoveryStatus;
  message?: string;
};

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

const JOB_STATUS_POLL_INTERVAL_MS = 500;
const JOB_STATUS_MAX_POLLS = 20;

const SOURCE_SITE_KEYS_BY_KIND: Record<CreateProductSourceSiteKind, string[]> = {
  JV: ["JV_DE", "JV_AT", "JV_CH", "JV_CO_UK"],
  XL: [CREATE_PRODUCT_XL_DEFAULT_SITE_KEY],
  HOOD: ["HOOD_JV", "HOOD_XL"],
  KAUFLAND: ["KAUFLAND_JV", "KAUFLAND_XL"],
};

function getCompletedJobResult(job: Record<string, unknown>): OrchestratorResponse | null {
  const result = job.result;
  if (!result || typeof result !== "object") return null;

  const typedResult = result as Partial<OrchestratorResponse>;
  if (
    (typedResult.status !== "success" && typedResult.status !== "partial_success" && typedResult.status !== "failed") ||
    !Array.isArray(typedResult.results)
  ) {
    return null;
  }

  return typedResult as OrchestratorResponse;
}

function waitForDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

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
  const [jvSourceSnapshotsBySiteKey, setJvSourceSnapshotsBySiteKey] = useState<
    Partial<Record<string, CreateProductJvSourceSnapshot>>
  >({});
  const [jvSourceSnapshotsReady, setJvSourceSnapshotsReady] = useState(false);
  const [sourceDiscoveryBySiteKey, setSourceDiscoveryBySiteKey] = useState<
    Partial<Record<string, CreateProductSourceDiscovery>>
  >({});
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
      setJvSourceSnapshotsBySiteKey({});
      setJvSourceSnapshotsReady(false);
      setSourceDiscoveryBySiteKey({});
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
    setJvSourceSnapshotsBySiteKey({});
    setJvSourceSnapshotsReady(false);
    setSourceDiscoveryBySiteKey({});
  }, [kidContext?.mainEan]);

  useEffect(() => {
    const mainEan = kidContext?.mainEan.trim() || "";
    if (!mainEan || prefetchedMainEansRef.current.has(mainEan)) {
      return;
    }

    prefetchedMainEansRef.current.add(mainEan);
    let active = true;
    const sourceKinds: CreateProductSourceSiteKind[] = ["JV", "XL", "HOOD", "KAUFLAND"];

    setSourceDiscoveryBySiteKey(
      Object.fromEntries(
        sourceKinds.flatMap((site) => SOURCE_SITE_KEYS_BY_KIND[site].map((siteKey) => [siteKey, { status: "loading" }])),
      ),
    );

    void Promise.allSettled(
      sourceKinds.map(async (site) => {
        try {
          const sites = await fetchCreateProductSourceSitesByMainEan({ mainEan, site });
          if (!active) return;

          sourceCacheRef.current.sitesBySource.set(sourceCacheKey(mainEan, site), sites);
          const foundSiteKeys = new Set(sites.map((sourceSite) => sourceSite.siteKey));
          setSourceDiscoveryBySiteKey((current) => {
            const next = { ...current };
            for (const siteKey of SOURCE_SITE_KEYS_BY_KIND[site]) {
              next[siteKey] = foundSiteKeys.has(siteKey) ? { status: "loading" } : { status: "missing" };
            }
            return next;
          });
          await Promise.allSettled(
            sites.map(async (sourceSite) => {
              try {
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
                  if (site === "JV") {
                    setJvSourceSnapshotsBySiteKey((current) => ({
                      ...current,
                      [sourceSite.siteKey]: snapshot,
                    }));
                  }
                  setSourceDiscoveryBySiteKey((current) => ({
                    ...current,
                    [sourceSite.siteKey]: { status: "found" },
                  }));
                }
              } catch (error) {
                if (!active) return;
                const message = normalizeCreateProductRuntimeError(error, `Failed to load ${sourceSite.siteKey}.`);
                setSourceDiscoveryBySiteKey((current) => ({
                  ...current,
                  [sourceSite.siteKey]: { status: "error", message },
                }));
              }
            }),
          );
        } catch (error) {
          if (!active) return;
          const message = normalizeCreateProductRuntimeError(error, `Failed to load ${site} source sites.`);
          setSourceDiscoveryBySiteKey((current) => ({
            ...current,
            ...Object.fromEntries(
              SOURCE_SITE_KEYS_BY_KIND[site].map((siteKey) => [siteKey, { status: "error", message }]),
            ),
          }));
        }
      }),
    ).finally(() => {
      if (active) setJvSourceSnapshotsReady(true);
    });

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
        if (sourceSite === "JV") {
          setJvSourceSnapshotsBySiteKey((current) => ({
            ...current,
            [selectedSourceSiteKey]: snapshot,
          }));
        }
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

  function validateCreateFields(formInput: CreateProductFormInput = { ean, price, productName, imagesText }): boolean {
    const validation = validateCreateProductInput(formInput);
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

  async function waitForJobOutcome(jobId: string): Promise<OrchestratorResponse | null> {
    for (let poll = 0; poll < JOB_STATUS_MAX_POLLS; poll += 1) {
      if (poll > 0) {
        await waitForDelay(JOB_STATUS_POLL_INTERVAL_MS);
      }

      const job = await getOrchestratorJob(jobId);
      setJobStatusJson(JSON.stringify(job, null, 2));

      const status = typeof job.status === "string" ? job.status : "";
      if (status === "queued" || status === "running") {
        continue;
      }

      const [attempts, events] = await Promise.all([
        getOrchestratorJobAttempts(jobId),
        getOrchestratorJobEvents(jobId),
      ]);
      setJobAttemptsJson(JSON.stringify(attempts, null, 2));
      setJobEventsJson(JSON.stringify(events, null, 2));

      const result = getCompletedJobResult(job);
      if (result) {
        return result;
      }

      const jobError = job.error;
      if (jobError && typeof jobError === "object") {
        const errorMessage = (jobError as Record<string, unknown>).message;
        const message = typeof errorMessage === "string"
          ? errorMessage
          : "Orchestrator job failed.";
        throw new Error(message);
      }

      return null;
    }

    return null;
  }

  async function showCompletedJobOutcome(jobId: string): Promise<void> {
    const result = await waitForJobOutcome(jobId);
    if (!result) {
      showToast(`Job ${jobId} is still processing. Open job status for the final result.`, "info");
      return;
    }

    const failedCount = result.results.filter((item) => item.status === "failed").length;
    const toast = buildOrchestratorStatusToastMessage({
      labels: t,
      status: result.status,
      totalResults: result.results.length,
      failedCount,
      failureSummary: buildFailureSummary(result.results),
    });
    showToast(toast.message, toast.tone);
  }

  async function submitCreateProduct(
    siteIdsOverride?: string[],
    operation = Operation.update,
    additionalPayload?: Record<string, unknown>,
    formInput: CreateProductFormInput = { ean, price, productName, imagesText },
  ) {
    const targetSiteIds = Array.isArray(siteIdsOverride) ? siteIdsOverride : selectedSites;
    if (targetSiteIds.length === 0) {
      showToast(t.selectAtLeastOneMarketplaceSite, "error");
      return;
    }
    if (!validateCreateFields(formInput)) {
      showToast(t.fixFormErrorsBeforeCreate, "error");
      return;
    }

    const normalized = normalizeCreateProductInput(formInput);

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
        await showCompletedJobOutcome(created.jobId);
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

  async function handleCreateProduct(
    xljvOverrides: Record<string, unknown> = {},
    selectedSiteIds = ["jvmoebel-de", "xlmoebel_de", "hood-jv", "hood-xl", "kaufland-jv", "kaufland-xl"],
    publishDraft?: {
      kauflandDescription?: string;
      kauflandShortDescription?: string;
      kauflandTitle?: string;
      kauflandEan?: string;
      kauflandPrice?: string;
      kauflandFields?: MainKauflandCreateFields;
      kauflandOverrides?: Record<string, unknown>;
      ottoEan?: string;
      ottoTitle?: string;
      ottoPrice?: string;
      ottoImageUrls?: string[];
      ottoPayload?: Record<string, unknown>;
    },
    uploadedImageFiles?: File[],
  ) {
    const draftInput = publishDraft?.kauflandEan !== undefined
      ? { ean: publishDraft.kauflandEan, price: publishDraft.kauflandPrice ?? "", productName: publishDraft.kauflandTitle ?? "", imagesText }
      : publishDraft?.ottoEan !== undefined
        ? {
            ean: publishDraft.ottoEan,
            price: publishDraft.ottoPrice ?? "",
            productName: publishDraft.ottoTitle ?? "",
            imagesText: (publishDraft.ottoImageUrls ?? []).join("\n"),
          }
        : { ean, price, productName, imagesText };
    const baseValidation = validateCreateProductInput(draftInput);
    if (!baseValidation.isValid) {
      const invalidFields = [
        baseValidation.errors.ean ? "EAN must contain exactly 13 digits" : "",
        baseValidation.errors.price ? "Price must be a number with up to 2 decimal places" : "",
        baseValidation.errors.productName ? "Title must contain at least 3 characters" : "",
      ].filter(Boolean);
      showToast(`${t.fixFormErrorsBeforeCreate}: ${invalidFields.join("; ")}`, "error");
      return;
    }
    const hasHoodSelection = selectedSiteIds.some((siteId) => siteId.startsWith("hood-"));
    const hasKauflandSelection = selectedSiteIds.some((siteId) => siteId.startsWith("kaufland-"));
    const hasOttoSelection = selectedSiteIds.some((siteId) => siteId.startsWith("otto-"));
    const hasXljvSelection = selectedSiteIds.some((siteId) => siteId.startsWith("jvmoebel-") || siteId === "xlmoebel_de");
    const hoodErrors = hasHoodSelection ? validateHoodCreateFields(hoodFields) : {};
    const effectiveKauflandFields = publishDraft?.kauflandFields ?? mainKauflandFields;
    const kauflandErrors = hasKauflandSelection ? validateMainKauflandCreateFields(effectiveKauflandFields) : {};
    const xljvErrors = hasXljvSelection ? validateMainXljvCreateFields(mainXljvFields) : {};
    setHoodFieldErrors(hoodErrors);
    setMainKauflandFieldErrors(kauflandErrors);
    setMainXljvFieldErrors(xljvErrors);
    if (Object.keys(hoodErrors).length > 0 || Object.keys(kauflandErrors).length > 0 || Object.keys(xljvErrors).length > 0) {
      showToast("Correct the highlighted marketplace fields before creating the job.", "error");
      return;
    }

    const kauflandDescription = publishDraft?.kauflandDescription ?? hoodFields.description;
    if (hasKauflandSelection && !kauflandDescription.trim()) {
      showToast("Add a description before publishing to Kaufland.", "error");
      return;
    }
    if ((hasHoodSelection || hasKauflandSelection) && !kidContext?.kidNumber.trim()) {
      showToast("Open Create Product from a Kid before publishing to HOOD or Kaufland.", "error");
      return;
    }

    const normalized = normalizeCreateProductInput(draftInput);
    const effectiveImageFiles = uploadedImageFiles ?? imageFiles;

    setSubmitting(true);
    try {
      let imageUrls = hasKauflandSelection
        ? normalizeKauflandImageUrls(normalized.imageUrls)
        : normalized.imageUrls;
      if (hasKauflandSelection) {
        const uploadedImageUrls: string[] = [];
        if (effectiveImageFiles.length > 0) {
          uploadedImageUrls.push(...await uploadKauflandImages({
            ean: normalized.ean,
            files: effectiveImageFiles,
          }));
        }
        if (imageUrls.length > 0) {
          uploadedImageUrls.push(...await uploadKauflandImages({
            ean: normalized.ean,
            sourceUrls: imageUrls,
          }));
        }
        imageUrls = Array.from(new Set(uploadedImageUrls));
      } else if (hasOttoSelection) {
        const uploadedImageUrls: string[] = [];
        if (effectiveImageFiles.length > 0) {
          const uploadResult = await xljvUploadImages({
            site: "OTTO",
            ean: normalized.ean,
            files: effectiveImageFiles,
          });
          if (!uploadResult.response.ok) {
            throw new Error(String(uploadResult.payload.detail || `OTTO image upload failed: HTTP ${uploadResult.response.status}`));
          }
          uploadedImageUrls.push(...(Array.isArray(uploadResult.payload.uploaded_image_urls)
            ? uploadResult.payload.uploaded_image_urls.map((value) => String(value || "").trim()).filter(Boolean)
            : []));
        }
        const remoteImageUrls = imageUrls.filter((value) => /^https?:\/\//i.test(value));
        if (remoteImageUrls.length > 0) {
          const uploadResult = await xljvUploadImages({
            site: "OTTO",
            ean: normalized.ean,
            files: [],
            sourceUrls: remoteImageUrls,
          });
          if (!uploadResult.response.ok) {
            throw new Error(String(uploadResult.payload.detail || `OTTO remote image upload failed: HTTP ${uploadResult.response.status}`));
          }
          uploadedImageUrls.push(...(Array.isArray(uploadResult.payload.uploaded_image_urls)
            ? uploadResult.payload.uploaded_image_urls.map((value) => String(value || "").trim()).filter(Boolean)
            : []));
        }
        imageUrls = Array.from(new Set(uploadedImageUrls));
      } else if (effectiveImageFiles.length > 0) {
        const uploadResult = await xljvUploadImages({
          site: "JV",
          siteKey: "JV_DE",
          ean: normalized.ean,
          files: effectiveImageFiles,
        });
        if (!uploadResult.response.ok) {
          throw new Error(
            String(uploadResult.payload.detail || `Image upload failed: HTTP ${uploadResult.response.status}`),
          );
        }
        const uploadedImageUrls = Array.isArray(uploadResult.payload.uploaded_image_urls)
          ? uploadResult.payload.uploaded_image_urls
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          : [];
        imageUrls = Array.from(new Set([...uploadedImageUrls, ...normalized.imageUrls]));
      }
      if (imageUrls.length === 0) {
        showToast("Upload at least one image before creating the marketplace job.", "error");
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
      ...publishDraft?.kauflandOverrides,
      ...buildMainKauflandCreatePayload({
        ean: normalized.ean,
        imageUrls,
        description: kauflandDescription,
        fields: effectiveKauflandFields,
      }),
      title: publishDraft?.kauflandTitle?.trim() || normalized.productName,
      ean: publishDraft?.kauflandEan?.trim() || normalized.ean,
      price: publishDraft?.kauflandPrice?.trim().replace(",", ".") || normalized.price,
      description: kauflandDescription.trim(),
      ...(publishDraft?.kauflandShortDescription !== undefined
        ? {
            short_description: publishDraft.kauflandShortDescription
              .split(/[\n,;]/)
              .map((item) => item.trim())
              .filter(Boolean),
          }
        : {}),
      };
      const requestedOttoPayload = publishDraft?.ottoPayload ?? {};
      if (hasOttoSelection && Object.keys(requestedOttoPayload).length === 0) {
        showToast("Complete the OTTO product fields before creating the job.", "error");
        return;
      }
      const ottoPayload = {
        ...requestedOttoPayload,
        mediaAssets: imageUrls.map((location) => ({
          type: "IMAGE",
          location,
          filename: location.split("/").pop() || normalized.ean,
        })),
      };
      const created = await createMainMarketplaceProductJob({
        ean: normalized.ean,
        productName: normalized.productName,
        description: kauflandDescription.trim(),
        price: normalized.price,
        imageUrls,
        kidNumber: kidContext?.kidNumber,
        selectedSiteIds,
        xljvPayload,
        hoodPayload,
        kauflandPayload,
        ottoPayload,
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

  async function handleCreateProductForHoodSiteIds(
    siteIds: string[],
    draft?: HoodPublishDraft,
    uploadedImageFiles?: File[],
  ) {
    const effectiveFields = draft?.fields ?? hoodFields;
    const hoodErrors = validateHoodCreateFields(effectiveFields);
    setHoodFieldErrors(hoodErrors);
    if (Object.keys(hoodErrors).length > 0) {
      showToast("Complete the required Hood fields before publishing.", "error");
      return;
    }

    const input = { ean: draft?.ean ?? ean, price: draft?.price ?? price, productName: draft?.name ?? productName, imagesText };
    const validation = validateCreateProductInput(input);
    if (!validation.isValid) {
      showToast(t.fixFormErrorsBeforeCreate, "error");
      return;
    }
    const normalized = normalizeCreateProductInput(input);
    let imageUrls = normalized.imageUrls;
    if (uploadedImageFiles && uploadedImageFiles.length > 0) {
      try {
        const account: HoodAccount = siteIds.includes("hood-xl") ? "xl" : "jv";
        const uploadResult = await patchHoodByEan({
          ean: normalized.ean,
          account,
          payloadObject: {},
          changedKeys: [],
          patchFiles: uploadedImageFiles,
          uploadOnly: true,
        });
        if (!uploadResult.response.ok) {
          throw new Error(
            `Image upload failed: HTTP ${uploadResult.response.status}`,
          );
        }
        const uploadedPayload = uploadResult.payload && typeof uploadResult.payload === "object"
          ? uploadResult.payload as Record<string, unknown>
          : {};
        const uploadedImageUrls = Array.isArray(uploadedPayload.uploaded_image_urls)
          ? uploadedPayload.uploaded_image_urls
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          : [];
        imageUrls = Array.from(new Set([...uploadedImageUrls, ...imageUrls]));
      } catch (error) {
        showToast(normalizeCreateProductRuntimeError(error, "Failed to upload Hood product images."), "error");
        return;
      }
    }
    if (imageUrls.length === 0) {
      showToast("Upload at least one image before creating the Hood job.", "error");
      return;
    }
    await submitCreateProduct(
      siteIds,
      Operation.publish,
      buildHoodCreatePayload({ ean: normalized.ean, fields: effectiveFields }),
      { ...input, imagesText: imageUrls.join("\n") },
    );
  }

  async function handleCreateProductForXlDefaultSite(draft?: XlPublishDraft, uploadedImageFiles?: File[]) {
    const input = {
      ean: draft?.ean ?? ean,
      price: draft?.price ?? price,
      productName: draft?.name ?? productName,
      imagesText,
    };
    const validation = validateCreateProductInput(input);
    if (!validation.isValid) {
      const invalidFields = [
        validation.errors.ean ? t.ean : null,
        validation.errors.price ? t.price : null,
        validation.errors.productName ? t.name : null,
      ].filter(Boolean).join(", ");
      showToast(
        invalidFields ? `${t.fixFormErrorsBeforeCreate}: ${invalidFields}` : t.fixFormErrorsBeforeCreate,
        "error",
      );
      return;
    }

    const manufacturerId = Number(draft?.manufacturer_id);
    if (!Number.isInteger(manufacturerId) || manufacturerId <= 0) {
      showToast("Select an XL manufacturer before creating the product.", "error");
      return;
    }

    const normalized = normalizeCreateProductInput(input);
    const defaultSiteKey = CREATE_PRODUCT_XL_DEFAULT_SITE_KEY;
    const effectiveImageFiles = uploadedImageFiles ?? imageFiles;

    setSubmitting(true);
    try {
      let uploadedUrls: string[] = [];
      if (effectiveImageFiles.length > 0 || normalized.imageUrls.length > 0) {
        const uploadResult = await xljvUploadImages({
          site: "XL",
          siteKey: defaultSiteKey,
          ean: normalized.ean,
          files: effectiveImageFiles,
          sourceUrls: effectiveImageFiles.length === 0 ? normalized.imageUrls : [],
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
        manufacturer_id: manufacturerId,
        quantity: 0,
        status: true,
        image: uploadedUrls[0] || undefined,
        images: uploadedUrls.slice(1).map((url, index) => ({ image: url, sort_order: index })),
        descriptions: [
          {
            language_id: 1,
            name: normalized.productName,
            description: draft?.description ?? normalized.productName,
            tag: draft?.tag ?? "",
            meta_title: draft?.meta_title ?? normalized.productName,
            meta_description: draft?.meta_description ?? normalized.productName,
            meta_keyword: draft?.meta_keyword ?? "",
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
    jvSourceSnapshotsBySiteKey,
    jvSourceSnapshotsReady,
    sourceDiscoveryBySiteKey,
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
