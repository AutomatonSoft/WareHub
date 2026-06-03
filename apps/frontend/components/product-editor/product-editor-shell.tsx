"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { AppShell } from "../layout/app-shell";
import { Card, CardContent } from "../ui/card";
import { useToast } from "../shared/toast-provider";
import { LoadingState } from "../ui/loading-state";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import {
  applyJvBatchUpdateByEan,
  applyProductEditorPlan,
  discoverProductEditor,
  getJvBatchJobStatus,
  getProductEditorJob,
  loadProductEditorGroup,
  planProductEditor
} from "./product-editor-api";
import type { ProductEditorJvBatchJobStatusResponse } from "./product-editor-api";
import { fetchHoodByEan, patchHoodByEan } from "../hood/hood-api";
import { extractFirstItemFromPayload } from "../hood/hood-search-utils";
import { ProductEditorHeaderCard } from "./product-editor-header-card";
import {
  buildHoodChangedFields,
  buildJvChangedFields,
  createEmptyHoodDraft,
  createEmptyJvDraft,
  findGroup,
  findTarget,
  hasActionableHoodTarget,
  hasActionableJvTarget,
  hydrateHoodDraft,
  hydrateJvDraft
} from "./product-editor-model";
import {
  buildHoodDraftFromApiItem,
  buildHoodPatchPayloadFromDraft,
  extractPendingUploadFiles,
  mergeHoodImageUrls,
  reorderHoodImages,
  removeHoodImage
} from "./product-editor-hood-sync";
import { ProductEditorActiveGroupPanel } from "./product-editor-active-group-panel";
import { PRODUCT_EDITOR_TAB_COPY } from "./product-editor-copy";
import type {
  ProductEditorApplyResponse,
  ProductEditorDiscoverResponse,
  ProductEditorGroupId,
  ProductEditorHoodDraft,
  ProductEditorJobResponse,
  ProductEditorJvDraft,
  ProductEditorPlanResponse,
  ProductEditorTarget
} from "./product-editor-types";

type HoodTabKey = "HOOD_JV" | "HOOD_XL";
type HoodDraftsByTab = Record<HoodTabKey, ProductEditorHoodDraft>;
type HoodWarningsByTab = Record<HoodTabKey, ProductEditorDiscoverResponse["warnings"]>;
type HoodLoadingByTab = Record<HoodTabKey, boolean>;
type HoodApplyLoadingByTab = Record<HoodTabKey, boolean>;
type HoodImageUploadLoadingByTab = Record<HoodTabKey, boolean>;

function ProductEditorContent() {
  const { showToast } = useToast();
  const [eanInput, setEanInput] = useState("");
  const [tabEanInputs, setTabEanInputs] = useState<Record<string, string>>({});
  const [discovering, setDiscovering] = useState(false);
  const [discover, setDiscover] = useState<ProductEditorDiscoverResponse | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<ProductEditorGroupId>("HOOD");
  const [activeTabKey, setActiveTabKey] = useState<string>("HOOD_JV");
  const [pageError, setPageError] = useState<string | null>(null);

  const [hoodLoadingByTab, setHoodLoadingByTab] = useState<HoodLoadingByTab>(createEmptyHoodLoadingByTab());
  const [hoodApplyLoadingByTab, setHoodApplyLoadingByTab] = useState<HoodApplyLoadingByTab>(createEmptyHoodLoadingByTab());
  const [hoodImageUploadLoadingByTab, setHoodImageUploadLoadingByTab] = useState<HoodImageUploadLoadingByTab>(createEmptyHoodLoadingByTab());
  const [hoodDraftsByTab, setHoodDraftsByTab] = useState<HoodDraftsByTab>(createEmptyHoodDraftsByTab());
  const [initialHoodDraftsByTab, setInitialHoodDraftsByTab] = useState<HoodDraftsByTab>(createEmptyHoodDraftsByTab());
  const [hoodWarningsByTab, setHoodWarningsByTab] = useState<HoodWarningsByTab>(createEmptyHoodWarningsByTab());

  const [jvLoading, setJvLoading] = useState(false);
  const [jvDraft, setJvDraft] = useState<ProductEditorJvDraft>(createEmptyJvDraft());
  const [initialJvDraft, setInitialJvDraft] = useState<ProductEditorJvDraft>(createEmptyJvDraft());
  const [jvWarnings, setJvWarnings] = useState<ProductEditorDiscoverResponse["warnings"]>([]);

  const [planLoading, setPlanLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [jobLoading, setJobLoading] = useState(false);
  const [jvBatchApplyLoading, setJvBatchApplyLoading] = useState(false);
  const [jvBatchStatusResponse, setJvBatchStatusResponse] = useState<ProductEditorJvBatchJobStatusResponse | null>(null);
  const [planResponse, setPlanResponse] = useState<ProductEditorPlanResponse | null>(null);
  const [applyResponse, setApplyResponse] = useState<ProductEditorApplyResponse | null>(null);
  const [jobResponse, setJobResponse] = useState<ProductEditorJobResponse | null>(null);
  const [applyConfirmed, setApplyConfirmed] = useState(false);

  const activeTabEanInput = tabEanInputs[activeTabKey] ?? "";
  const effectiveTabEanInput = activeTabEanInput.trim() || eanInput.trim();
  const activeHoodTabKey = getHoodTabKey(activeTabKey);
  const hoodDraft = activeHoodTabKey ? hoodDraftsByTab[activeHoodTabKey] : createEmptyHoodDraft();
  const initialHoodDraft = activeHoodTabKey ? initialHoodDraftsByTab[activeHoodTabKey] : createEmptyHoodDraft();
  const hoodWarnings = activeHoodTabKey ? hoodWarningsByTab[activeHoodTabKey] : [];
  const hoodLoading = activeHoodTabKey ? hoodLoadingByTab[activeHoodTabKey] : false;
  const hoodApplyLoading = activeHoodTabKey ? hoodApplyLoadingByTab[activeHoodTabKey] : false;
  const hoodImageUploadLoading = activeHoodTabKey ? hoodImageUploadLoadingByTab[activeHoodTabKey] : false;
  const isGlobalEanValid = /^\d{13}$/.test(eanInput.trim());
  const isEffectiveTabEanValid = /^\d{13}$/.test(effectiveTabEanInput);
  const hasLocalLoadedJv = activeGroupId === "JV" && isLoadedJvDraft(jvDraft, effectiveTabEanInput);
  const hasLocalLoadedHood =
    activeGroupId === "HOOD" &&
    isLoadedHoodDraft(hoodDraft, effectiveTabEanInput, getSourceVariantFromTab(activeTabKey));
  const hoodChangedFields = useMemo(() => buildHoodChangedFields(initialHoodDraft, hoodDraft), [hoodDraft, initialHoodDraft]);
  const jvChangedFields = useMemo(() => buildJvChangedFields(initialJvDraft, jvDraft), [initialJvDraft, jvDraft]);
  const targetStats = useMemo(() => {
    const targets = (discover?.groups ?? [])
      .flatMap((group) => group.targets)
      .filter((target) => target.id !== "JV_MAIN");
    return {
      foundCount: targets.filter((target) => target.status === "found").length,
      missingCount: targets.filter((target) => target.status === "missing").length,
      totalCount: targets.length
    };
  }, [discover]);

  useEffect(() => {
    if (!discover) return;
    const preferredTargetId = getPreferredTargetIdForTab(discover, activeTabKey);
    if (
      activeGroupId === "HOOD" &&
      hasActionableHoodTarget(findGroup(discover, "HOOD")) &&
      !isLoadedHoodDraft(hoodDraft, discover.ean, getSourceVariantFromTab(activeTabKey), preferredTargetId)
    ) {
      void loadHoodDraft(discover, preferredTargetId ?? discover.recommended_baseline_target_id);
    }
    if (activeGroupId === "JV" && hasActionableJvTarget(findGroup(discover, "JV")) && !isLoadedJvDraft(jvDraft, discover.ean)) {
      void loadJvDraft(discover, discover.recommended_baseline_target_id);
    }
  }, [activeGroupId, activeTabKey, discover, hoodDraft, jvDraft]);

  useEffect(() => {
    if (!jobResponse) return;
    if (jobResponse.status !== "queued" && jobResponse.status !== "running") return;
    const timer = window.setTimeout(() => {
      void refreshJob(jobResponse.job_id, false);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [jobResponse]);

  async function handleSearchGlobal() {
    const ean = eanInput.trim();
    if (!/^\d{13}$/.test(ean)) return;
    await runDiscover(ean);
  }

  async function handleSearchForActiveTab() {
    const ean = effectiveTabEanInput;
    if (!/^\d{13}$/.test(ean)) return;
    setDiscovering(true);
    setPageError(null);
    setDiscover(null);
    try {
      if (activeGroupId === "JV") {
        const loaded = await loadJvDraftByEan(ean);
        if (!loaded) {
          showToast(`Product ${ean} not found for JV tab.`, "error");
          return;
        }
        showToast(`JV tab loaded for ${ean}.`, "success");
        return;
      }
      if (activeGroupId === "HOOD") {
        const loaded = await loadHoodDraftByEan(ean);
        if (!loaded) {
          showToast(`Product ${ean} not found for ${activeTabKey.replace("_", " ")} tab.`, "error");
          return;
        }
        showToast(`${activeTabKey.replace("_", " ")} tab loaded for ${ean}.`, "success");
        return;
      }
      showToast("Local tab search is currently available for JV and HOOD tabs.", "error");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tab search failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setDiscovering(false);
    }
  }

  async function runDiscover(ean: string) {
    setDiscovering(true);
    resetEditorState();
    setPageError(null);
    try {
      const response = await discoverProductEditor(ean);
      setDiscover(response);
      setActiveGroupId(response.selected_group_id);
      setActiveTabKey(getDefaultTabKeyForGroup(response.selected_group_id));
      showToast(`Product Editor discover completed for ${ean}.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product Editor discover failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setDiscovering(false);
    }
  }

  async function loadHoodDraft(currentDiscover: ProductEditorDiscoverResponse, preferredTargetId?: string | null) {
    const tabKey = getHoodTabKey(activeTabKey) ?? getHoodTabKeyForTargetId(preferredTargetId) ?? "HOOD_JV";
    setHoodTabLoading(tabKey, true);
    setPageError(null);
    try {
      const account = getHoodAccountFromTab(tabKey);
      const { response, payload } = await fetchHoodByEan(currentDiscover.ean, account);
      if (!response.ok) {
        throw new Error(payload.detail || `HOOD load failed: HTTP ${response.status}`);
      }
      const firstItem = extractFirstItemFromPayload(payload.external_payload);
      const hydrated = buildHoodDraftFromApiItem({
        account,
        ean: currentDiscover.ean,
        item: firstItem,
        targetId: preferredTargetId || tabKey,
        rawPayload: (payload.external_payload && typeof payload.external_payload === "object" ? payload.external_payload : {}) as Record<string, unknown>
      });
      if (!hydrated) {
        throw new Error(`No HOOD item found for ${currentDiscover.ean} (${account.toUpperCase()}).`);
      }
      setHoodTabDraft(tabKey, hydrated);
      setInitialHoodTabDraft(tabKey, hydrated);
      setHoodTabWarnings(tabKey, []);
      clearPlanAndJobState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hood draft load failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setHoodTabLoading(tabKey, false);
    }
  }

  async function loadJvDraft(currentDiscover: ProductEditorDiscoverResponse, preferredTargetId?: string | null) {
    setJvLoading(true);
    setPageError(null);
    try {
      const response = await loadProductEditorGroup({ ean: currentDiscover.ean, activeGroup: "JV", baselineTargetId: preferredTargetId });
      const hydrated = hydrateJvDraft(response.draft as never);
      setJvDraft(hydrated);
      setInitialJvDraft(hydrated);
      setJvWarnings(response.warnings);
      clearPlanAndJobState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "JV draft load failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setJvLoading(false);
    }
  }

  function handleTabChange(tabKey: string) {
    const tab = PRODUCT_EDITOR_DISPLAY_TABS.find((item) => item.key === tabKey);
    if (!tab) return;
    setActiveTabKey(tab.key);
    setActiveGroupId(tab.groupId);
  }

  async function loadJvDraftByEan(ean: string): Promise<boolean> {
    setJvLoading(true);
    try {
      const response = await loadProductEditorGroup({ ean, activeGroup: "JV", baselineTargetId: null });
      const hydrated = hydrateJvDraft(response.draft as never);
      if (!hydrated.target_id) return false;
      setJvDraft(hydrated);
      setInitialJvDraft(hydrated);
      setJvWarnings(response.warnings);
      clearPlanAndJobState();
      return true;
    } finally {
      setJvLoading(false);
    }
  }

  async function loadHoodDraftByEan(ean: string): Promise<boolean> {
    const tabKey = getHoodTabKey(activeTabKey) ?? "HOOD_JV";
    setHoodTabLoading(tabKey, true);
    try {
      const account = getHoodAccountFromTab(tabKey);
      const { response, payload } = await fetchHoodByEan(ean, account);
      if (!response.ok) {
        throw new Error(payload.detail || `HOOD load failed: HTTP ${response.status}`);
      }
      const firstItem = extractFirstItemFromPayload(payload.external_payload);
      const hydrated = buildHoodDraftFromApiItem({
        account,
        ean,
        item: firstItem,
        targetId: tabKey,
        rawPayload: (payload.external_payload && typeof payload.external_payload === "object" ? payload.external_payload : {}) as Record<string, unknown>
      });
      if (!hydrated?.target_id) return false;
      setHoodTabDraft(tabKey, hydrated);
      setInitialHoodTabDraft(tabKey, hydrated);
      setHoodTabWarnings(tabKey, []);
      clearPlanAndJobState();
      return true;
    } finally {
      setHoodTabLoading(tabKey, false);
    }
  }

  function patchActiveTabEan(value: string) {
    setTabEanInputs((current) => ({ ...current, [activeTabKey]: value }));
  }

  function patchHoodDraft(patch: Partial<ProductEditorHoodDraft>) {
    const tabKey = getHoodTabKey(activeTabKey);
    if (!tabKey) return;
    setHoodDraftsByTab((current) => ({
      ...current,
      [tabKey]: { ...current[tabKey], ...patch }
    }));
    clearPlanStateOnly();
  }

  function applyHoodImagesUpdate(nextImages: string[]) {
    patchHoodDraft({
      image: nextImages[0] ?? "",
      images: nextImages,
      pending_uploads: []
    });
  }

  function patchJvDraft(patch: Partial<ProductEditorJvDraft>) {
    setJvDraft((current) => ({ ...current, ...patch }));
    clearPlanStateOnly();
  }

  async function handleReviewChanges() {
    const { activeDraft, changedFields, selectedTargetIds } = getPlanContext();
    if (!activeDraft || changedFields.length === 0) {
      showToast("No draft changes to review.", "error");
      return;
    }
    const planEan = getPlanEan(activeDraft);
    if (!/^\d{13}$/.test(planEan)) {
      showToast("Active tab EAN is invalid.", "error");
      return;
    }
    setPlanLoading(true);
    setPageError(null);
    try {
      const response = await planProductEditor({
        ean: planEan,
        activeGroup: activeGroupId,
        changedFields,
        draft: activeDraft as unknown as Record<string, unknown>,
        selectedTargetIds
      });
      setPlanResponse(response);
      setApplyResponse(null);
      setJobResponse(null);
      setApplyConfirmed(false);
      showToast(`Plan generated for ${response.targets.map((target) => target.label).join(", ")}.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product Editor plan failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleApplyJvEditedProducts() {
    const ean = jvDraft.ean.trim();
    if (!/^\d{13}$/.test(ean)) {
      showToast("JV EAN is invalid.", "error");
      return;
    }
    if (jvChangedFields.length === 0) {
      showToast("No edited JV fields to apply.", "error");
      return;
    }

    const payload = buildJvBatchPayloadFromDraft(jvDraft, jvChangedFields);
    setJvBatchApplyLoading(true);
    setPageError(null);
    try {
      const response = await applyJvBatchUpdateByEan({ ean, payload });
      const jobId = Number(response.job?.id ?? 0);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        throw new Error("JV batch apply did not return a valid job id.");
      }
      setJvBatchStatusResponse({
        code: response.code,
        detail: response.detail,
        job: response.job ?? { id: jobId, status: "pending", result_summary: {}, items: [] }
      });
      showToast(response.detail || `JV batch job ${jobId} queued.`, "success");
      const finalJob = await pollJvBatchJobUntilFinished(jobId);
      const finalStatus = String(finalJob.status || "").toLowerCase();
      const summary = finalJob.result_summary ?? {};
      const applied = Number(summary.applied ?? 0);
      const failed = Number(summary.failed ?? 0);
      const skipped = Number(summary.skipped ?? 0);
      if (finalStatus === "applied") {
        setInitialJvDraft(jvDraft);
        showToast(`JV batch completed. Applied: ${applied}, Failed: ${failed}, Skipped: ${skipped}.`, "success");
      } else {
        showToast(`JV batch finished with status ${finalStatus || "unknown"}. Applied: ${applied}, Failed: ${failed}, Skipped: ${skipped}.`, "error");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "JV batch apply failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setJvBatchApplyLoading(false);
    }
  }

  function handleRemoveHoodImage(imageUrl: string) {
    applyHoodImagesUpdate(removeHoodImage(hoodDraft.images, imageUrl));
  }

  function handleReorderHoodImages(sourceImageUrl: string, targetImageUrl: string) {
    applyHoodImagesUpdate(reorderHoodImages(hoodDraft.images, sourceImageUrl, targetImageUrl));
  }

  async function handleUploadHoodImages(role: "main" | "additional", files: FileList | null) {
    const tabKey = getHoodTabKey(activeTabKey);
    if (!tabKey || !files || files.length === 0) return;

    const ean = hoodDraft.ean.trim();
    if (!/^\d{13}$/.test(ean)) {
      showToast("Load HOOD product first, then upload images.", "error");
      return;
    }

    setHoodTabImageUploadLoading(tabKey, true);
    setPageError(null);
    try {
      const { response, payload } = await patchHoodByEan({
        ean,
        account: hoodDraft.account,
        payloadObject: {},
        changedKeys: [],
        patchFiles: Array.from(files),
        uploadOnly: true
      });
      if (!response.ok) {
        const detail =
          payload && typeof payload === "object" && "detail" in (payload as Record<string, unknown>)
            ? String((payload as Record<string, unknown>).detail || "")
            : "";
        throw new Error(detail || `HOOD FTP upload failed: HTTP ${response.status}`);
      }

      const uploadedUrls =
        payload && typeof payload === "object" && Array.isArray((payload as { uploaded_image_urls?: unknown[] }).uploaded_image_urls)
          ? (payload as { uploaded_image_urls?: unknown[] }).uploaded_image_urls!.map((item) => String(item || "").trim()).filter(Boolean)
          : [];
      if (uploadedUrls.length === 0) {
        throw new Error("FTP upload finished but no URLs were returned.");
      }

      const nextImages = mergeHoodImageUrls(hoodDraft.images, uploadedUrls, role);
      applyHoodImagesUpdate(nextImages);
      showToast(
        role === "main"
          ? `Main image uploaded to HOOD FTP.`
          : `${uploadedUrls.length} additional image(s) uploaded to HOOD FTP.`,
        "success"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "HOOD FTP upload failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setHoodTabImageUploadLoading(tabKey, false);
    }
  }

  async function handleApplyHoodEditedProducts() {
    const tabKey = getHoodTabKey(activeTabKey);
    if (!tabKey) return;

    const ean = hoodDraft.ean.trim();
    if (!/^\d{13}$/.test(ean)) {
      showToast("HOOD EAN is invalid.", "error");
      return;
    }

    const patchFiles = extractPendingUploadFiles(hoodDraft.pending_uploads);
    if (hoodChangedFields.length === 0 && patchFiles.length === 0) {
      showToast("No edited HOOD fields to apply.", "error");
      return;
    }

    const { changedKeys, payloadObject } = buildHoodPatchPayloadFromDraft(hoodDraft, hoodChangedFields);
    setHoodTabApplyLoading(tabKey, true);
    setPageError(null);
    try {
      const { response, payload } = await patchHoodByEan({
        ean,
        account: hoodDraft.account,
        payloadObject,
        changedKeys,
        patchFiles
      });
      if (!response.ok) {
        const detail =
          payload && typeof payload === "object" && "detail" in (payload as Record<string, unknown>)
            ? String((payload as Record<string, unknown>).detail || "")
            : "";
        throw new Error(detail || `HOOD update failed: HTTP ${response.status}`);
      }
      const reloaded = await loadHoodDraftByEan(ean);
      if (!reloaded) {
        showToast("HOOD updated, but automatic reload returned no item.", "success");
      } else {
        showToast("HOOD item updated successfully.", "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "HOOD update failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setHoodTabApplyLoading(tabKey, false);
    }
  }

  async function pollJvBatchJobUntilFinished(jobId: number) {
    const maxAttempts = 120;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await getJvBatchJobStatus(jobId);
      setJvBatchStatusResponse(response);
      const job = response.job ?? null;
      const statusValue = String(job?.status || "").toLowerCase();
      if (job && statusValue !== "pending" && statusValue !== "running") {
        return job;
      }
      const delayMs =
        attempt <= 5 ? 3000 :
        attempt <= 20 ? 5000 :
        8000;
      await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
    }

    throw new Error(`JV batch job ${jobId} polling timed out.`);
  }

  async function handleApplyPlan() {
    if (!planResponse) return;
    setApplyLoading(true);
    setPageError(null);
    try {
      const response = await applyProductEditorPlan(planResponse.plan_id);
      setApplyResponse(response);
      showToast(`Apply accepted for job ${response.job_id.slice(0, 8)}.`, "success");
      await refreshJob(response.job_id, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product Editor apply failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setApplyLoading(false);
    }
  }

  async function refreshJob(jobId: string, showSuccessToast: boolean) {
    setJobLoading(true);
    try {
      const response = await getProductEditorJob(jobId);
      setJobResponse(response);
      if (showSuccessToast) {
        showToast(`Job ${jobId.slice(0, 8)} loaded with status ${response.status}.`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product Editor job refresh failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setJobLoading(false);
    }
  }

  function getPlanContext() {
    if (activeGroupId === "HOOD") {
      return {
        activeDraft: hoodDraft,
        changedFields: hoodChangedFields,
        selectedTargetIds: hoodDraft.target_id ? [hoodDraft.target_id] : []
      };
    }
    if (activeGroupId === "JV") {
      return {
        activeDraft: jvDraft,
        changedFields: jvChangedFields,
        selectedTargetIds: discover?.groups
          .find((group) => group.id === "JV")
          ?.targets.filter((target) => target.status === "found")
          .map((target) => target.id) ?? []
      };
    }
    return { activeDraft: null, changedFields: [], selectedTargetIds: [] };
  }

  function clearPlanStateOnly() {
    setPlanResponse(null);
    setApplyResponse(null);
    setApplyConfirmed(false);
  }

  function clearPlanAndJobState() {
    clearPlanStateOnly();
    setJobResponse(null);
    setJvBatchStatusResponse(null);
  }

  function resetEditorState() {
    setDiscover(null);
    setHoodDraftsByTab(createEmptyHoodDraftsByTab());
    setInitialHoodDraftsByTab(createEmptyHoodDraftsByTab());
    setHoodWarningsByTab(createEmptyHoodWarningsByTab());
    setHoodLoadingByTab(createEmptyHoodLoadingByTab());
    setHoodApplyLoadingByTab(createEmptyHoodLoadingByTab());
    setHoodImageUploadLoadingByTab(createEmptyHoodLoadingByTab());
    setJvDraft(createEmptyJvDraft());
    setInitialJvDraft(createEmptyJvDraft());
    setJvWarnings([]);
    setPlanResponse(null);
    setApplyResponse(null);
    setJobResponse(null);
    setJvBatchStatusResponse(null);
    setApplyConfirmed(false);
  }

  function setHoodTabDraft(tabKey: HoodTabKey, draft: ProductEditorHoodDraft) {
    setHoodDraftsByTab((current) => ({ ...current, [tabKey]: draft }));
  }

  function setInitialHoodTabDraft(tabKey: HoodTabKey, draft: ProductEditorHoodDraft) {
    setInitialHoodDraftsByTab((current) => ({ ...current, [tabKey]: draft }));
  }

  function setHoodTabWarnings(tabKey: HoodTabKey, warnings: ProductEditorDiscoverResponse["warnings"]) {
    setHoodWarningsByTab((current) => ({ ...current, [tabKey]: warnings }));
  }

  function setHoodTabLoading(tabKey: HoodTabKey, loading: boolean) {
    setHoodLoadingByTab((current) => ({ ...current, [tabKey]: loading }));
  }

  function setHoodTabApplyLoading(tabKey: HoodTabKey, loading: boolean) {
    setHoodApplyLoadingByTab((current) => ({ ...current, [tabKey]: loading }));
  }

  function setHoodTabImageUploadLoading(tabKey: HoodTabKey, loading: boolean) {
    setHoodImageUploadLoadingByTab((current) => ({ ...current, [tabKey]: loading }));
  }

  return (
    <AppShell title="Product Editor" subtitle="Orchestrator-only draft workspace for centralized product editing.">
      <div className="wh-product-editor-page flex w-full flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <ProductEditorHeaderCard
          eanInput={eanInput}
          onChangeEan={setEanInput}
          onSearch={() => void handleSearchGlobal()}
          discovering={discovering}
          isEanValid={isGlobalEanValid}
          discover={discover}
          foundCount={targetStats.foundCount}
          missingCount={targetStats.missingCount}
          totalCount={targetStats.totalCount}
        />

        {pageError ? (
          <Card className="border-destructive/20 bg-destructive/10 text-destructive shadow-sm">
            <CardContent className="pt-0 text-sm">{pageError}</CardContent>
          </Card>
        ) : null}

        {jvBatchStatusResponse ? (
          <JvBatchProgressCard response={jvBatchStatusResponse} />
        ) : null}

        <Card className="wh-product-editor-tabs-card rounded-2xl border-border bg-white shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)]">
          <CardContent className="space-y-2 pt-3">
            <Tabs value={activeTabKey} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid h-auto w-full min-w-max grid-cols-10 gap-1.5 overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-1 md:min-w-0">
                {PRODUCT_EDITOR_DISPLAY_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    className="relative h-10 min-w-[110px] rounded-lg border border-transparent px-3 text-xs font-semibold uppercase tracking-[0.04em] transition hover:border-border/80 hover:bg-white/70 data-[state=active]:border-primary/35 data-[state=active]:bg-emerald-50/80 data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-1 data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-emerald-600"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        <ProductEditorActiveGroupPanel
          discover={discover}
          activeGroupId={activeGroupId}
          activeTabLabel={PRODUCT_EDITOR_DISPLAY_TABS.find((tab) => tab.key === activeTabKey)?.label ?? PRODUCT_EDITOR_TAB_COPY[activeGroupId].label}
          hoodDraft={hoodDraft}
          initialHoodDraft={initialHoodDraft}
          hoodWarnings={hoodWarnings}
          hoodLoading={hoodLoading}
          hoodApplyLoading={hoodApplyLoading}
          hoodImageUploadLoading={hoodImageUploadLoading}
          onPatchHood={patchHoodDraft}
          jvDraft={jvDraft}
          initialJvDraft={initialJvDraft}
          jvWarnings={jvWarnings}
          jvLoading={jvLoading}
          onPatchJv={patchJvDraft}
          hoodChangedFields={hoodChangedFields}
          jvChangedFields={jvChangedFields}
          planResponse={planResponse}
          planLoading={planLoading}
          applyLoading={applyLoading}
          applyConfirmed={applyConfirmed}
          setApplyConfirmed={setApplyConfirmed}
          onReviewChanges={handleReviewChanges}
          onApplyPlan={handleApplyPlan}
          jobResponse={jobResponse}
          jobLoading={jobLoading}
          onRefreshJob={() => {
            if (applyResponse?.job_id) void refreshJob(applyResponse.job_id, false);
          }}
          eanValue={activeTabEanInput}
          isEanValid={isEffectiveTabEanValid}
          searching={discovering}
          onChangeEan={patchActiveTabEan}
          onSearch={() => void handleSearchForActiveTab()}
          hasLocalLoadedHood={hasLocalLoadedHood}
          hasLocalLoadedJv={hasLocalLoadedJv}
          jvBatchApplyLoading={jvBatchApplyLoading}
          onRemoveHoodImage={handleRemoveHoodImage}
          onReorderHoodImages={handleReorderHoodImages}
          onUploadHoodMainFiles={(files) => void handleUploadHoodImages("main", files)}
          onUploadHoodAdditionalFiles={(files) => void handleUploadHoodImages("additional", files)}
          onApplyHoodEditedProducts={() => void handleApplyHoodEditedProducts()}
          onApplyJvEditedProducts={() => void handleApplyJvEditedProducts()}
        />
      </div>
    </AppShell>
  );
}

function findFirstFoundTarget(group: ReturnType<typeof findGroup>): ProductEditorTarget | null {
  return group?.targets.find((target) => target.status === "found") ?? null;
}

function isLoadedJvDraft(draft: ProductEditorJvDraft, ean: string): boolean {
  return draft.ean === ean && Boolean(draft.target_id);
}

function getPlanEan(activeDraft: ProductEditorHoodDraft | ProductEditorJvDraft): string {
  return String(activeDraft.ean || "").trim();
}

const PRODUCT_EDITOR_DISPLAY_TABS: Array<{ key: string; label: string; groupId: ProductEditorGroupId }> = [
  { key: "JV", label: "JV", groupId: "JV" },
  { key: "XL", label: "XL", groupId: "XL" },
  { key: "HOOD_JV", label: "HOOD JV", groupId: "HOOD" },
  { key: "HOOD_XL", label: "HOOD XL", groupId: "HOOD" },
  { key: "OTTO_JV", label: "OTTO JV", groupId: "OTTO" },
  { key: "OTTO_XL", label: "OTTO XL", groupId: "OTTO" },
  { key: "KAUFLAND_JV", label: "KAUFLAND JV", groupId: "KAUFLAND" },
  { key: "KAUFLAND_XL", label: "KAUFLAND XL", groupId: "KAUFLAND" },
  { key: "EBAY_JV", label: "EBAY JV", groupId: "EBAY" },
  { key: "EBAY_XL", label: "EBAY XL", groupId: "EBAY" }
];

function createEmptyHoodDraftsByTab(): HoodDraftsByTab {
  return {
    HOOD_JV: { ...createEmptyHoodDraft(), account: "jv", target_id: "HOOD_JV" },
    HOOD_XL: { ...createEmptyHoodDraft(), account: "xl", target_id: "HOOD_XL" }
  };
}

function createEmptyHoodWarningsByTab(): HoodWarningsByTab {
  return {
    HOOD_JV: [],
    HOOD_XL: []
  };
}

function createEmptyHoodLoadingByTab(): HoodLoadingByTab {
  return {
    HOOD_JV: false,
    HOOD_XL: false
  };
}

function getHoodTabKey(tabKey: string): HoodTabKey | null {
  if (tabKey === "HOOD_JV" || tabKey === "HOOD_XL") return tabKey;
  return null;
}

function getHoodTabKeyForTargetId(targetId?: string | null): HoodTabKey | null {
  const normalized = String(targetId || "").toUpperCase();
  if (normalized.includes("HOOD_XL") || normalized.endsWith("_XL")) return "HOOD_XL";
  if (normalized.includes("HOOD_JV") || normalized.endsWith("_JV")) return "HOOD_JV";
  return null;
}

function getHoodAccountFromTab(tabKey: HoodTabKey): "jv" | "xl" {
  return tabKey === "HOOD_XL" ? "xl" : "jv";
}

function getDefaultTabKeyForGroup(groupId: ProductEditorGroupId): string {
  const tab = PRODUCT_EDITOR_DISPLAY_TABS.find((item) => item.groupId === groupId);
  return tab?.key ?? "HOOD_JV";
}

function getSourceVariantFromTab(tabKey: string): "jv" | "xl" | null {
  if (tabKey.endsWith("_JV")) return "jv";
  if (tabKey.endsWith("_XL")) return "xl";
  return null;
}

function isLoadedHoodDraft(
  draft: ProductEditorHoodDraft,
  ean: string,
  expectedVariant: "jv" | "xl" | null,
  expectedTargetId?: string | null
): boolean {
  if (!/^\d{13}$/.test(ean) || !/^\d{13}$/.test(draft.ean)) return false;
  if (draft.ean !== ean || !draft.target_id) return false;
  if (expectedVariant && draft.account !== expectedVariant) return false;
  if (expectedTargetId && draft.target_id !== expectedTargetId) return false;
  return true;
}

function getPreferredTargetIdForTab(discover: ProductEditorDiscoverResponse, tabKey: string): string | null {
  const tab = PRODUCT_EDITOR_DISPLAY_TABS.find((item) => item.key === tabKey);
  if (!tab) return null;
  const group = findGroup(discover, tab.groupId);
  if (!group) return null;
  const variant = getSourceVariantFromTab(tabKey);
  if (!variant) return null;
  const variantUpper = variant.toUpperCase();

  const matched = group.targets.find((target) => {
    const id = String(target.id || "").toUpperCase();
    const family = String(target.account_family || "").toUpperCase();
    const label = String(target.label || "").toUpperCase();
    return id.includes(`_${variantUpper}`) || family === variantUpper || label.includes(variantUpper);
  });
  return matched?.id ?? null;
}

function buildJvBatchPayloadFromDraft(draft: ProductEditorJvDraft, changedFields: string[]): Record<string, unknown> {
  const changed = new Set(changedFields);
  const translationSource = buildJvTranslationSource(draft);
  const payload: Record<string, unknown> = {
    site_keys: ["JV_DE", "JV_CO_UK", "JV_CH", "JV_AT"],
    template_site_key: "JV_DE",
    source_currency: "EUR",
    convert_currency: true,
    translate_texts: true,
    translation_source_language: "auto",
    translation_source: translationSource,
    locale_by_site_key: {
      JV_DE: "de",
      JV_CO_UK: "en",
      JV_CH: "de",
      JV_AT: "de"
    }
  };

  if (changed.has("source_model")) payload.source_model = draft.source_model ?? "";
  if (changed.has("source_sku")) payload.source_sku = draft.source_sku ?? "";
  if (changed.has("source_ean_field")) payload.source_ean_field = draft.source_ean_field ?? "";
  if (changed.has("price")) payload.price = draft.price ?? "";
  if (changed.has("quantity")) payload.quantity = draft.quantity === "" ? null : Number(draft.quantity);
  if (changed.has("status")) payload.status = Boolean(draft.status);
  if (changed.has("image")) payload.image = draft.image ?? "";
  if (changed.has("descriptions")) payload.descriptions = draft.descriptions;
  if (changed.has("categories")) payload.categories = draft.categories;
  if (changed.has("images")) payload.images = draft.images;
  if (changed.has("jv_fields")) payload.jv_fields = draft.jv_fields;

  return payload;
}

function buildJvTranslationSource(draft: ProductEditorJvDraft): Record<string, string> {
  const contentRows = Array.isArray(draft.jv_fields?.content_by_language)
    ? (draft.jv_fields.content_by_language as Array<Record<string, unknown>>)
    : [];
  const deContent =
    contentRows.find((row) => String(row?.language_code ?? "de").toLowerCase() === "de") ??
    contentRows[0] ??
    {};
  const firstDescription = draft.descriptions[0] ?? {};

  return {
    name: String(deContent.name ?? firstDescription.name ?? ""),
    description: String(deContent.description ?? firstDescription.description ?? ""),
    kurzbeschreibung: String(
      deContent.kurzbeschreibung ??
        deContent.short_description_real ??
        deContent.bezeichnung ??
        ""
    ),
    tag: String(firstDescription.tag ?? ""),
    meta_title: String(deContent.meta_title ?? firstDescription.meta_title ?? ""),
    meta_description: String(deContent.meta_description ?? firstDescription.meta_description ?? ""),
    meta_keyword: String(deContent.meta_keyword ?? firstDescription.meta_keyword ?? "")
  };
}

type JvBatchProgressItem = {
  id: number;
  siteKey: string;
  status: string;
  targetLocale: string;
  progressPhase: string;
  progressMessage: string;
  phaseUpdatedAt: string;
};

function JvBatchProgressCard({ response }: { response: ProductEditorJvBatchJobStatusResponse }) {
  const job = response.job;
  const jobSummary = job?.result_summary && typeof job.result_summary === "object"
    ? (job.result_summary as Record<string, unknown>)
    : {};
  const items = normalizeJvBatchItems(job?.items);
  const total = items.length;
  const applied = items.filter((item) => item.status === "applied").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const skipped = items.filter((item) => item.status === "skipped").length;
  const completed = applied + failed + skipped;
  const pending = Math.max(total - completed, 0);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const jobStatus = String(job?.status || "pending").toLowerCase();
  const jobPhase = String(jobSummary.progress_phase ?? "").trim();
  const jobMessage = String(jobSummary.progress_message ?? "").trim();

  return (
    <Card className="rounded-2xl border-border bg-white shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)]">
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">JV Batch Progress</div>
            <div className="text-xs text-muted-foreground">
              Job #{job?.id ?? "?"} · status: {jobStatus}
            </div>
            {jobPhase || jobMessage ? (
              <div className="text-xs text-muted-foreground">
                phase: {jobPhase || "n/a"}{jobMessage ? ` · ${jobMessage}` : ""}
              </div>
            ) : null}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{completed} / {total || "?"} sites completed</div>
            <div>Applied: {applied} · Failed: {failed} · Pending: {pending}</div>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all"
            style={{ width: `${Math.max(6, percent)}%` }}
          />
        </div>
        {items.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{item.siteKey}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusToneClass(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  locale: {item.targetLocale || "n/a"}
                </div>
                {item.progressPhase || item.progressMessage ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    phase: {item.progressPhase || "n/a"}{item.progressMessage ? ` · ${item.progressMessage}` : ""}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Targets are being prepared in worker. Site-level progress will appear here as soon as items are created.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function normalizeJvBatchItems(rawItems: Array<Record<string, unknown>> | undefined): JvBatchProgressItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((raw, index) => {
    const details = raw.details && typeof raw.details === "object"
      ? (raw.details as Record<string, unknown>)
      : {};
    return {
      id: Number(raw.id ?? index),
      siteKey: String(raw.site_key ?? raw.siteKey ?? `site-${index + 1}`),
      status: String(raw.status ?? "pending").toLowerCase(),
      targetLocale: String(details.target_locale ?? raw.target_locale ?? ""),
      progressPhase: String(details.progress_phase ?? ""),
      progressMessage: String(details.progress_message ?? ""),
      phaseUpdatedAt: String(details.phase_updated_at ?? "")
    };
  });
}

function statusToneClass(status: string): string {
  switch (status) {
    case "applied":
      return "bg-emerald-100 text-emerald-700";
    case "failed":
      return "bg-rose-100 text-rose-700";
    case "skipped":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-amber-100 text-amber-700";
  }
}

export function ProductEditorShell() {
  return (
    <Suspense fallback={<LoadingState title="Loading product editor workspace..." />}>
      <ProductEditorContent />
    </Suspense>
  );
}
