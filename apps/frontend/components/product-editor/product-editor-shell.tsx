"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { useLabels } from "../../app/use-labels";
import { AppShell } from "../layout/app-shell";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { useToast } from "../shared/toast-provider";
import { LoadingState } from "../ui/loading-state";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { cn } from "../../lib/utils";
import {
  applyProductEditorPlan,
  discoverProductEditor,
  getProductEditorJob,
  loadProductEditorGroup,
  planProductEditor,
  uploadProductEditorImages
} from "./product-editor-api";
import { fetchHoodByEan, patchHoodByEan } from "../hood/hood-api";
import { extractFirstItemFromPayload } from "../hood/hood-search-utils";
import { ProductEditorHeaderCard } from "./product-editor-header-card";
import {
  ProductEditorBatchEditDialog,
  type ProductEditorBatchEditResult,
  type ProductEditorBatchEditSite,
} from "./product-editor-batch-edit-dialog";
import {
  buildHoodChangedFields,
  buildJvChangedFields,
  buildKauflandChangedFields,
  buildOttoChangedFields,
  createEmptyHoodDraft,
  createEmptyJvDraft,
  createEmptyKauflandDraft,
  createEmptyOttoDraft,
  findGroup,
  findTarget,
  hasActionableHoodTarget,
  hasActionableJvTarget,
  hydrateHoodDraft,
  hydrateJvDraft,
  hydrateKauflandDraft,
  hydrateOttoDraft,
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
import { getProductEditorTabCopy } from "./product-editor-copy";
import type {
  ProductEditorApplyResponse,
  ProductEditorDiscoverResponse,
  ProductEditorGroupId,
  ProductEditorHoodDraft,
  ProductEditorJobResponse,
  ProductEditorJvDraft,
  ProductEditorKauflandDraft,
  ProductEditorOttoDraft,
  ProductEditorPlanResponse,
  ProductEditorJvSiteKey,
  ProductEditorTarget
} from "./product-editor-types";

type HoodTabKey = "HOOD_JV" | "HOOD_XL";
type JvTabKey = "JV" | "XL";
type KauflandTabKey = "KAUFLAND_JV" | "KAUFLAND_XL";
type OttoTabKey = "OTTO_JV" | "OTTO_XL";
type HoodDraftsByTab = Record<HoodTabKey, ProductEditorHoodDraft>;
type HoodWarningsByTab = Record<HoodTabKey, ProductEditorDiscoverResponse["warnings"]>;
type HoodLoadingByTab = Record<HoodTabKey, boolean>;
type HoodApplyLoadingByTab = Record<HoodTabKey, boolean>;
type HoodImageUploadLoadingByTab = Record<HoodTabKey, boolean>;
type DraftsByTab<TDraft, TTabKey extends string> = Record<TTabKey, TDraft>;
type WarningsByTab<TTabKey extends string> = Record<TTabKey, ProductEditorDiscoverResponse["warnings"]>;
type LoadingByTab<TTabKey extends string> = Record<TTabKey, boolean>;
type ProductEditorTabSearchStatus = "idle" | "loading" | "found" | "missing" | "unavailable" | "error";

type ProductEditorChangedMarketplace = {
  tabKey: string;
  groupId: ProductEditorGroupId;
  ean: string;
  changedFields: string[];
  draft: Record<string, unknown>;
  selectedTargetIds: string[];
};

type ProductEditorPlannedMarketplace = {
  change: ProductEditorChangedMarketplace;
  plan: ProductEditorPlanResponse;
};

const PRODUCT_IDENTIFIER_MAX_LENGTH = 100;
const JV_IMAGE_UPLOAD_MAX_ATTEMPTS_PER_SITE = 12;
const JV_IMAGE_UPLOAD_RETRY_DELAY_MS = 1500;
const PRODUCT_EDITOR_QUERY_PARAM_BY_TAB: Record<string, string> = {
  JV: "jv",
  XL: "xl",
  HOOD_JV: "hood_jv",
  HOOD_XL: "hood_xl",
  KAUFLAND_JV: "kaufland_jv",
  KAUFLAND_XL: "kaufland_xl",
  OTTO_JV: "otto_jv",
  OTTO_XL: "otto_xl",
  EBAY_JV: "ebay_jv",
  EBAY_XL: "ebay_xl",
};

function isValidProductIdentifier(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= PRODUCT_IDENTIFIER_MAX_LENGTH;
}

function hasFoundTargetInGroup(response: ProductEditorDiscoverResponse, groupId: ProductEditorGroupId): boolean {
  return response.groups
    .find((group) => group.id === groupId)
    ?.targets.some((target) => target.status === "found") ?? false;
}

function getTabSearchStatus(response: ProductEditorDiscoverResponse, tabKey: string): ProductEditorTabSearchStatus {
  const tab = PRODUCT_EDITOR_DISPLAY_TABS.find((item) => item.key === tabKey);
  if (!tab) return "error";
  const group = response.groups.find((item) => item.id === tab.groupId);
  const variant = getSourceVariantFromTab(tabKey);
  const targets = group?.targets.filter((target) => {
    if (!variant) return true;
    const normalizedVariant = variant.toUpperCase();
    return String(target.id || "").toUpperCase().includes(`_${normalizedVariant}`) ||
      String(target.account_family || "").toUpperCase() === normalizedVariant ||
      String(target.label || "").toUpperCase().includes(normalizedVariant);
  });
  if (!targets) return "error";
  if (targets.some((target) => target.status === "found")) return "found";
  if (targets.some((target) => target.status === "error")) return "error";
  if (targets.some((target) => target.status === "unknown" || target.status === "planned" || target.status === "unsupported" || target.status === "read_only")) {
    return "unavailable";
  }
  return "missing";
}

function ProductEditorContent() {
  const { showToast } = useToast();
  const t = useLabels();
  const searchParams = useSearchParams();
  const reducedMotion = useReducedMotion();
  const PRODUCT_EDITOR_TAB_COPY = getProductEditorTabCopy(t);
  const [eanInput, setEanInput] = useState("");
  const [tabEanInputs, setTabEanInputs] = useState<Record<string, string>>({});
  const [tabSearchStatuses, setTabSearchStatuses] = useState<Record<string, ProductEditorTabSearchStatus>>({});
  const [discovering, setDiscovering] = useState(false);
  const [discover, setDiscover] = useState<ProductEditorDiscoverResponse | null>(null);
  const discoverRequestVersionRef = useRef(0);
  const jvPublishingSelectionsLoadKeyRef = useRef<string | null>(null);
  const [activeTabKey, setActiveTabKey] = useState<string>("HOOD_JV");
  const activeGroupId = getGroupIdForTab(activeTabKey);
  const [pageError, setPageError] = useState<string | null>(null);

  const [hoodLoadingByTab, setHoodLoadingByTab] = useState<HoodLoadingByTab>(createEmptyHoodLoadingByTab());
  const [hoodApplyLoadingByTab, setHoodApplyLoadingByTab] = useState<HoodApplyLoadingByTab>(createEmptyHoodLoadingByTab());
  const [hoodImageUploadLoadingByTab, setHoodImageUploadLoadingByTab] = useState<HoodImageUploadLoadingByTab>(createEmptyHoodLoadingByTab());
  const [hoodDraftsByTab, setHoodDraftsByTab] = useState<HoodDraftsByTab>(createEmptyHoodDraftsByTab());
  const [initialHoodDraftsByTab, setInitialHoodDraftsByTab] = useState<HoodDraftsByTab>(createEmptyHoodDraftsByTab());
  const [hoodWarningsByTab, setHoodWarningsByTab] = useState<HoodWarningsByTab>(createEmptyHoodWarningsByTab());

  const [jvLoadingByTab, setJvLoadingByTab] = useState<LoadingByTab<JvTabKey>>(createEmptyJvLoadingByTab());
  const [jvDraftsByTab, setJvDraftsByTab] = useState<DraftsByTab<ProductEditorJvDraft, JvTabKey>>(createEmptyJvDraftsByTab());
  const [initialJvDraftsByTab, setInitialJvDraftsByTab] = useState<DraftsByTab<ProductEditorJvDraft, JvTabKey>>(createEmptyJvDraftsByTab());
  const [jvWarningsByTab, setJvWarningsByTab] = useState<WarningsByTab<JvTabKey>>(createEmptyJvWarningsByTab());
  const [kauflandLoadingByTab, setKauflandLoadingByTab] = useState<LoadingByTab<KauflandTabKey>>(createEmptyKauflandLoadingByTab());
  const [kauflandApplyLoading, setKauflandApplyLoading] = useState(false);
  const [kauflandDraftsByTab, setKauflandDraftsByTab] = useState<DraftsByTab<ProductEditorKauflandDraft, KauflandTabKey>>(createEmptyKauflandDraftsByTab());
  const [initialKauflandDraftsByTab, setInitialKauflandDraftsByTab] = useState<DraftsByTab<ProductEditorKauflandDraft, KauflandTabKey>>(createEmptyKauflandDraftsByTab());
  const [kauflandWarningsByTab, setKauflandWarningsByTab] = useState<WarningsByTab<KauflandTabKey>>(createEmptyKauflandWarningsByTab());
  const [ottoLoadingByTab, setOttoLoadingByTab] = useState<LoadingByTab<OttoTabKey>>(createEmptyOttoLoadingByTab());
  const [ottoApplyLoading, setOttoApplyLoading] = useState(false);
  const [ottoDraftsByTab, setOttoDraftsByTab] = useState<DraftsByTab<ProductEditorOttoDraft, OttoTabKey>>(createEmptyOttoDraftsByTab());
  const [initialOttoDraftsByTab, setInitialOttoDraftsByTab] = useState<DraftsByTab<ProductEditorOttoDraft, OttoTabKey>>(createEmptyOttoDraftsByTab());
  const [ottoWarningsByTab, setOttoWarningsByTab] = useState<WarningsByTab<OttoTabKey>>(createEmptyOttoWarningsByTab());

  const [planLoading, setPlanLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [jobLoading, setJobLoading] = useState(false);
  const [jvBatchApplyLoading, setJvBatchApplyLoading] = useState(false);
  const [planResponse, setPlanResponse] = useState<ProductEditorPlanResponse | null>(null);
  const [globalPlans, setGlobalPlans] = useState<ProductEditorPlannedMarketplace[]>([]);
  const [globalPlanLoading, setGlobalPlanLoading] = useState(false);
  const [globalApplyLoading, setGlobalApplyLoading] = useState(false);
  const [globalApplyConfirmed, setGlobalApplyConfirmed] = useState(false);
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false);
  const [batchEditResults, setBatchEditResults] = useState<ProductEditorBatchEditResult[]>([]);
  const [dirtyTabKeys, setDirtyTabKeys] = useState<Set<string>>(() => new Set());
  const [applyResponse, setApplyResponse] = useState<ProductEditorApplyResponse | null>(null);
  const [jobResponse, setJobResponse] = useState<ProductEditorJobResponse | null>(null);
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  const skipNextAutoJvLoadKeyRef = useRef<string | null>(null);
  const jvAutoLoadInFlightKeyRef = useRef<string | null>(null);
  const loadedJvAutoLoadKeyRef = useRef<string | null>(null);
  const kauflandLoadInFlightEanRef = useRef<string | null>(null);
  const autoSearchHandledEanRef = useRef<string | null>(null);
  const autoTabSearchHandledKeyRef = useRef<string | null>(null);
  const globalPrefetchInFlightRef = useRef(false);
  const autoLoadHandledKeysRef = useRef<Set<string>>(new Set());
  const autoSearchEan = (searchParams.get("ean") ?? "").trim();
  const tabEansFromSearchParams = useMemo(() => {
    return Object.fromEntries(
      Object.entries(PRODUCT_EDITOR_QUERY_PARAM_BY_TAB)
        .map(([tabKey, queryParam]) => [tabKey, (searchParams.get(queryParam) ?? "").trim()])
        .filter(([, ean]) => isValidProductIdentifier(ean))
    ) as Record<string, string>;
  }, [searchParams]);
  const tabEansSearchKey = Object.entries(tabEansFromSearchParams).map(([tabKey, ean]) => `${tabKey}:${ean}`).join("|");
  const tabSearchRequestKey = `${autoSearchEan}|${tabEansSearchKey}`;

  const activeTabEanInput = tabEanInputs[activeTabKey] ?? "";
  const effectiveTabEanInput = activeTabEanInput.trim();
  const activeHoodTabKey = getHoodTabKey(activeTabKey);
  const activeJvTabKey = getJvTabKey(activeTabKey);
  const activeKauflandTabKey = getKauflandTabKey(activeTabKey);
  const activeOttoTabKey = getOttoTabKey(activeTabKey);
  const hoodDraft = activeHoodTabKey ? hoodDraftsByTab[activeHoodTabKey] : createEmptyHoodDraft();
  const initialHoodDraft = activeHoodTabKey ? initialHoodDraftsByTab[activeHoodTabKey] : createEmptyHoodDraft();
  const hoodWarnings = activeHoodTabKey ? hoodWarningsByTab[activeHoodTabKey] : [];
  const hoodLoading = activeHoodTabKey ? hoodLoadingByTab[activeHoodTabKey] : false;
  const hoodApplyLoading = activeHoodTabKey ? hoodApplyLoadingByTab[activeHoodTabKey] : false;
  const hoodImageUploadLoading = activeHoodTabKey ? hoodImageUploadLoadingByTab[activeHoodTabKey] : false;
  const jvDraft = activeJvTabKey ? jvDraftsByTab[activeJvTabKey] : createEmptyJvDraft();
  const initialJvDraft = activeJvTabKey ? initialJvDraftsByTab[activeJvTabKey] : createEmptyJvDraft();
  const jvWarnings = activeJvTabKey ? jvWarningsByTab[activeJvTabKey] : [];
  const jvLoading = activeJvTabKey ? jvLoadingByTab[activeJvTabKey] : false;
  const kauflandDraft = activeKauflandTabKey ? kauflandDraftsByTab[activeKauflandTabKey] : createEmptyKauflandDraft();
  const initialKauflandDraft = activeKauflandTabKey ? initialKauflandDraftsByTab[activeKauflandTabKey] : createEmptyKauflandDraft();
  const kauflandWarnings = activeKauflandTabKey ? kauflandWarningsByTab[activeKauflandTabKey] : [];
  const kauflandLoading = activeKauflandTabKey ? kauflandLoadingByTab[activeKauflandTabKey] : false;
  const ottoDraft = activeOttoTabKey ? ottoDraftsByTab[activeOttoTabKey] : createEmptyOttoDraft();
  const initialOttoDraft = activeOttoTabKey ? initialOttoDraftsByTab[activeOttoTabKey] : createEmptyOttoDraft();
  const ottoWarnings = activeOttoTabKey ? ottoWarningsByTab[activeOttoTabKey] : [];
  const ottoLoading = activeOttoTabKey ? ottoLoadingByTab[activeOttoTabKey] : false;
  const isGlobalEanValid = isValidProductIdentifier(eanInput);
  const isEffectiveTabEanValid = isValidProductIdentifier(effectiveTabEanInput);
  const hasLocalLoadedJv =
    (activeGroupId === "JV" || activeGroupId === "XL") &&
    isLoadedJvDraft(jvDraft, effectiveTabEanInput);
  const hasLocalLoadedHood =
    activeGroupId === "HOOD" &&
    isLoadedHoodDraft(hoodDraft, effectiveTabEanInput, getSourceVariantFromTab(activeTabKey));
  const hasLocalLoadedKaufland = activeGroupId === "KAUFLAND" && isLoadedKauflandDraft(kauflandDraft, discover?.ean ?? "");
  const hoodChangedFields = useMemo(() => buildHoodChangedFields(initialHoodDraft, hoodDraft), [hoodDraft, initialHoodDraft]);
  const jvChangedFields = useMemo(() => buildJvChangedFields(initialJvDraft, jvDraft), [initialJvDraft, jvDraft]);
  const kauflandChangedFields = useMemo(() => buildKauflandChangedFields(initialKauflandDraft, kauflandDraft), [initialKauflandDraft, kauflandDraft]);
  const ottoChangedFields = useMemo(() => buildOttoChangedFields(initialOttoDraft, ottoDraft), [initialOttoDraft, ottoDraft]);
  const changedMarketplacePlans = useMemo(() => {
    const changes: ProductEditorChangedMarketplace[] = [];
    const addChange = (input: ProductEditorChangedMarketplace) => {
      if (!isValidProductIdentifier(input.ean) || input.changedFields.length === 0 || input.selectedTargetIds.length === 0) return;
      changes.push(input);
    };

    (Object.keys(hoodDraftsByTab) as HoodTabKey[]).forEach((tabKey) => {
      if (!dirtyTabKeys.has(tabKey)) return;
      const draft = hoodDraftsByTab[tabKey];
      addChange({
        tabKey,
        groupId: "HOOD",
        ean: draft.ean.trim(),
        changedFields: buildHoodChangedFields(initialHoodDraftsByTab[tabKey], draft),
        draft: draft as unknown as Record<string, unknown>,
        selectedTargetIds: draft.target_id ? [draft.target_id] : [],
      });
    });

    (Object.keys(jvDraftsByTab) as JvTabKey[]).forEach((tabKey) => {
      if (!dirtyTabKeys.has(tabKey)) return;
      const draft = jvDraftsByTab[tabKey];
      addChange({
        tabKey,
        groupId: tabKey,
        ean: draft.ean.trim(),
        changedFields: buildJvChangedFields(initialJvDraftsByTab[tabKey], draft),
        draft: draft as unknown as Record<string, unknown>,
        selectedTargetIds: getJvTargetIdsForPlan(discover, tabKey, draft.target_id),
      });
    });

    (Object.keys(kauflandDraftsByTab) as KauflandTabKey[]).forEach((tabKey) => {
      if (!dirtyTabKeys.has(tabKey)) return;
      const draft = kauflandDraftsByTab[tabKey];
      addChange({
        tabKey,
        groupId: "KAUFLAND",
        ean: draft.ean.trim(),
        changedFields: buildKauflandChangedFields(initialKauflandDraftsByTab[tabKey], draft),
        draft: draft as unknown as Record<string, unknown>,
        selectedTargetIds: getTargetIdsForTab(discover, tabKey, ["found"]),
      });
    });

    (Object.keys(ottoDraftsByTab) as OttoTabKey[]).forEach((tabKey) => {
      if (!dirtyTabKeys.has(tabKey)) return;
      const draft = ottoDraftsByTab[tabKey];
      addChange({
        tabKey,
        groupId: "OTTO",
        ean: draft.ean.trim(),
        changedFields: buildOttoChangedFields(initialOttoDraftsByTab[tabKey], draft),
        draft: draft as unknown as Record<string, unknown>,
        selectedTargetIds: draft.target_id ? [draft.target_id] : getTargetIdsForTab(discover, tabKey, ["found"]),
      });
    });

    return changes;
  }, [
    discover,
    hoodDraftsByTab,
    dirtyTabKeys,
    initialHoodDraftsByTab,
    initialJvDraftsByTab,
    initialKauflandDraftsByTab,
    initialOttoDraftsByTab,
    jvDraftsByTab,
    kauflandDraftsByTab,
    ottoDraftsByTab,
  ]);
  const batchEditSites = useMemo<ProductEditorBatchEditSite[]>(() => (
    changedMarketplacePlans.map((change) => {
      const group = findGroup(discover, change.groupId);
      return {
        tabKey: change.tabKey,
        label: getProductEditorDisplayTabLabel(change.tabKey, t),
        targetIds: change.selectedTargetIds,
        targetLabels: change.selectedTargetIds.map((targetId) => findTarget(group, targetId)?.label ?? targetId),
        changedFieldsCount: change.changedFields.length,
      };
    })
  ), [changedMarketplacePlans, discover, t]);
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
  const discoveryItems = PRODUCT_EDITOR_DISPLAY_TABS
    .filter((tab) => tab.key === activeTabKey)
    .map((tab) => ({
      label: getProductEditorDisplayTabLabel(tab.key, t),
      ean: (tabEanInputs[tab.key] ?? "").trim(),
      status: tabSearchStatuses[tab.key] ?? "idle"
    }));

  useEffect(() => {
    if (!discover) return;
    if (globalPrefetchInFlightRef.current) return;
    const preferredTargetId = getPreferredTargetIdForTab(discover, activeTabKey);
    if (
      activeGroupId === "HOOD" &&
      hasActionableHoodTarget(findGroup(discover, "HOOD")) &&
      !isLoadedHoodDraft(hoodDraft, discover.ean, getSourceVariantFromTab(activeTabKey), preferredTargetId)
    ) {
      const autoLoadKey = `HOOD:${activeTabKey}:${discover.ean}`;
      if (autoLoadHandledKeysRef.current.has(autoLoadKey)) return;
      autoLoadHandledKeysRef.current.add(autoLoadKey);
      void loadHoodDraft(discover, preferredTargetId ?? discover.recommended_baseline_target_id);
    }
    if (
      (activeGroupId === "JV" || activeGroupId === "XL") &&
      hasActionableJvTarget(findGroup(discover, activeGroupId)) &&
      !isLoadedJvDraft(jvDraft, discover.ean)
    ) {
      const autoLoadKey = buildJvAutoLoadKey(discover.ean, discover.recommended_baseline_target_id);
      if (jvAutoLoadInFlightKeyRef.current === autoLoadKey) {
        return;
      }
      if (loadedJvAutoLoadKeyRef.current === autoLoadKey) {
        return;
      }
      if (skipNextAutoJvLoadKeyRef.current === autoLoadKey) {
        skipNextAutoJvLoadKeyRef.current = null;
        return;
      }
      if (autoLoadHandledKeysRef.current.has(autoLoadKey)) {
        return;
      }
      autoLoadHandledKeysRef.current.add(autoLoadKey);
      jvAutoLoadInFlightKeyRef.current = autoLoadKey;
      void loadJvDraft(discover, activeGroupId, discover.recommended_baseline_target_id);
    }
    if (activeGroupId === "KAUFLAND" && !hasLocalLoadedKaufland) {
      const autoLoadKey = `KAUFLAND:${activeTabKey}:${discover.ean}`;
      if (autoLoadHandledKeysRef.current.has(autoLoadKey)) return;
      autoLoadHandledKeysRef.current.add(autoLoadKey);
      if (kauflandLoadInFlightEanRef.current === discover.ean) return;
      kauflandLoadInFlightEanRef.current = discover.ean;
      void loadKauflandDraft(discover, preferredTargetId);
    }
    if (activeGroupId === "OTTO" && !ottoDraft.ean) {
      const autoLoadKey = `OTTO:${activeTabKey}:${discover.ean}`;
      if (autoLoadHandledKeysRef.current.has(autoLoadKey)) return;
      autoLoadHandledKeysRef.current.add(autoLoadKey);
      void loadOttoDraft(discover, discover.recommended_baseline_target_id);
    }
  }, [activeGroupId, activeTabKey, discover, hoodDraft, jvDraft, hasLocalLoadedKaufland]);

  useEffect(() => {
    if (!jobResponse) return;
    if (!jobResponse.job_id) return;
    if (jobResponse.status !== "queued" && jobResponse.status !== "running") return;
    const timer = window.setTimeout(() => {
      void refreshJob(jobResponse.job_id, false);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [jobResponse]);

  async function handleSearchGlobal() {
    const ean = eanInput.trim();
    if (!isValidProductIdentifier(ean)) return;
    const found = await runDiscover(ean, null);
    if (!found) {
      showToast(t.productEditorProductNotFound.replace("{tab}", "marketplaces"), "error");
    }
  }

  async function handleSearchForActiveTab() {
    const ean = effectiveTabEanInput;
    if (!isValidProductIdentifier(ean)) return;
    await searchProductForTab(activeTabKey, ean, true);
  }

  async function runDiscover(ean: string, activeGroup: ProductEditorGroupId | null, targetTabKey?: string): Promise<boolean> {
    const requestVersion = ++discoverRequestVersionRef.current;
    let backgroundPrefetchStarted = false;
    setDiscovering(true);
    resetEditorState();
    setPageError(null);
    try {
      const response = await discoverProductEditor(ean, activeGroup ?? undefined);
      const normalizedResponse = limitDiscoverToActiveGroup(response, activeGroup);
      const nextActiveGroup = activeGroup ?? activeGroupId;
      setDiscover(normalizedResponse);
      setActiveTabKey(targetTabKey ?? getDefaultTabKeyForGroup(nextActiveGroup));
      if (!activeGroup) {
        const nextTabEans = Object.fromEntries(PRODUCT_EDITOR_DISPLAY_TABS.map((tab) => [tab.key, ean]));
        setTabEanInputs(nextTabEans);
        setTabSearchStatuses(Object.fromEntries(
          PRODUCT_EDITOR_DISPLAY_TABS.map((tab) => [tab.key, getTabSearchStatus(normalizedResponse, tab.key)]),
        ));
        backgroundPrefetchStarted = true;
        globalPrefetchInFlightRef.current = true;
        void Promise.all(
          PRODUCT_EDITOR_DISPLAY_TABS.map((tab) => preloadGlobalTab(tab.key, normalizedResponse, requestVersion)),
        ).finally(() => {
          if (discoverRequestVersionRef.current === requestVersion) {
            globalPrefetchInFlightRef.current = false;
          }
        });
      }
      return activeGroup
        ? hasFoundTargetInGroup(normalizedResponse, nextActiveGroup)
        : normalizedResponse.groups.some((group) => group.targets.some((target) => target.status === "found"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t.productEditorDiscoverFailed;
      setPageError(message);
      showToast(message, "error");
      return false;
    } finally {
      if (!backgroundPrefetchStarted) {
        globalPrefetchInFlightRef.current = false;
      }
      setDiscovering(false);
    }
  }

  useEffect(() => {
    if (tabEansSearchKey || !isValidProductIdentifier(autoSearchEan) || autoSearchHandledEanRef.current === autoSearchEan) return;
    autoSearchHandledEanRef.current = autoSearchEan;
    setEanInput(autoSearchEan);
    void runDiscover(autoSearchEan, null);
    // `runDiscover` is intentionally invoked only when the URL identifier changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearchEan]);

  useEffect(() => {
    if ((!autoSearchEan && !tabEansSearchKey) || autoTabSearchHandledKeyRef.current === tabSearchRequestKey) return;
    autoTabSearchHandledKeyRef.current = tabSearchRequestKey;
    const tabEntries = Object.entries(tabEansFromSearchParams);
    setTabEanInputs(tabEansFromSearchParams);
    setTabSearchStatuses(
      Object.fromEntries(
        PRODUCT_EDITOR_DISPLAY_TABS.map((tab) => [tab.key, tabEansFromSearchParams[tab.key] ? "loading" : "missing"] as const)
      )
    );
    void Promise.all(tabEntries.map(([tabKey, ean]) => scanTabForProduct(tabKey, ean)));

    const initialTab = PRODUCT_EDITOR_DISPLAY_TABS.find((tab) => isValidProductIdentifier(tabEansFromSearchParams[tab.key] ?? ""));
    if (!initialTab) return;
    const initialEan = tabEansFromSearchParams[initialTab.key];
    setEanInput(autoSearchEan || initialEan);
    setActiveTabKey(initialTab.key);
    void searchProductForTab(initialTab.key, initialEan);
    // The search starts only once for a distinct set of EANs received from the inventory row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabEansFromSearchParams, tabSearchRequestKey]);

  async function loadHoodDraft(currentDiscover: ProductEditorDiscoverResponse, preferredTargetId?: string | null) {
    const tabKey = getHoodTabKey(activeTabKey) ?? getHoodTabKeyForTargetId(preferredTargetId) ?? "HOOD_JV";
    setHoodTabLoading(tabKey, true);
    try {
      const account = getHoodAccountFromTab(tabKey);
      const { response, payload } = await fetchHoodByEan(currentDiscover.ean, account);
      if (!response.ok) {
        throw new Error(payload.detail || t.productEditorHoodLoadFailedHttp.replace("{status}", String(response.status)));
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
        throw new Error(t.productEditorNoHoodItemFound.replace("{ean}", currentDiscover.ean).replace("{account}", account.toUpperCase()));
      }
      setHoodTabDraft(tabKey, hydrated);
      setInitialHoodTabDraft(tabKey, hydrated);
      setHoodTabWarnings(tabKey, []);
      clearPlanAndJobState();
    } catch {
      // Discovery status remains authoritative; a failed HOOD draft load must not replace it
      // with a raw external-provider message in the Product Editor UI.
    } finally {
      setHoodTabLoading(tabKey, false);
    }
  }

  async function loadJvDraft(
    currentDiscover: ProductEditorDiscoverResponse,
    activeGroup: "JV" | "XL" = "JV",
    preferredTargetId?: string | null
  ) {
    const tabKey: JvTabKey = activeGroup === "XL" ? "XL" : "JV";
    setPageError(null);
    try {
      await loadJvDraftForTab(currentDiscover.ean, tabKey, preferredTargetId);
    } catch (error) {
      const message = error instanceof Error ? error.message : `${activeGroup} draft load failed.`;
      setPageError(message);
      showToast(message, "error");
    }
  }

  function handleTabChange(tabKey: string) {
    const tab = PRODUCT_EDITOR_DISPLAY_TABS.find((item) => item.key === tabKey);
    if (!tab) return;
    setActiveTabKey(tab.key);
  }

  async function scanTabForProduct(tabKey: string, ean: string) {
    const tab = PRODUCT_EDITOR_DISPLAY_TABS.find((item) => item.key === tabKey);
    if (!tab || !isValidProductIdentifier(ean)) return;
    setTabSearchStatuses((current) => ({ ...current, [tabKey]: "loading" }));
    try {
      const response = await discoverProductEditor(ean, tab.groupId);
      setTabSearchStatuses((current) => ({
        ...current,
        [tabKey]: getTabSearchStatus(response, tabKey)
      }));
    } catch {
      setTabSearchStatuses((current) => ({ ...current, [tabKey]: "error" }));
    }
  }

  async function searchProductForTab(tabKey: string, ean: string, notifyWhenMissing = false): Promise<boolean> {
    const tab = PRODUCT_EDITOR_DISPLAY_TABS.find((item) => item.key === tabKey);
    if (!tab || !isValidProductIdentifier(ean)) return false;

    setActiveTabKey(tab.key);
    setTabSearchStatuses((current) => ({ ...current, [tab.key]: "loading" }));
    try {
      const found = tab.key === "JV"
        ? await loadJvDraftByEan(ean, "JV")
        : tab.key === "XL"
          ? await loadXlDraftByEan(ean)
          : tab.key === "HOOD_JV" || tab.key === "HOOD_XL"
            ? await loadHoodDraftByEan(ean, tab.key)
            : tab.key === "KAUFLAND_JV" || tab.key === "KAUFLAND_XL"
              ? await loadKauflandDraftByEan(ean, tab.key)
              : tab.key === "OTTO_JV" || tab.key === "OTTO_XL"
                ? await loadOttoDraftByEan(ean, tab.key)
              : await runDiscover(ean, tab.groupId, tab.key);
      setTabSearchStatuses((current) => ({ ...current, [tab.key]: found ? "found" : "missing" }));
      if (!found && notifyWhenMissing) {
        showToast(t.productEditorProductNotFound.replace("{tab}", getProductEditorDisplayTabLabel(tab.key, t)), "error");
      }
      return found;
    } catch (error) {
      const message = error instanceof Error ? error.message : t.productEditorDiscoverFailed;
      setPageError(message);
      if (notifyWhenMissing) showToast(message, "error");
      setTabSearchStatuses((current) => ({ ...current, [tab.key]: "error" }));
      return false;
    }
  }

  async function loadJvDraftByEan(ean: string, tabKey: JvTabKey = "JV"): Promise<boolean> {
    const activeGroup = tabKey === "XL" ? "XL" : "JV";
    const discovered = await discoverProductEditor(ean, activeGroup);
    skipNextAutoJvLoadKeyRef.current = buildJvAutoLoadKey(ean, discovered.recommended_baseline_target_id);
    setDiscover(limitDiscoverToActiveGroup(discovered, activeGroup));
    if (!hasFoundTargetInGroup(discovered, activeGroup)) return false;
    return loadJvDraftForTab(ean, tabKey, discovered.recommended_baseline_target_id);
  }

  async function loadXlDraftByEan(ean: string): Promise<boolean> {
    return loadJvDraftByEan(ean, "XL");
  }

  async function loadKauflandDraft(currentDiscover: ProductEditorDiscoverResponse, preferredTargetId?: string | null) {
    const tabKey = getKauflandTabKey(activeTabKey) ?? "KAUFLAND_JV";
    setPageError(null);
    try {
      await loadKauflandDraftForTab(currentDiscover.ean, tabKey, preferredTargetId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kaufland draft load failed.";
      setPageError(message);
      showToast(message, "error");
    }
  }

  async function loadKauflandDraftByEan(ean: string, tabKey: KauflandTabKey = "KAUFLAND_JV"): Promise<boolean> {
    kauflandLoadInFlightEanRef.current = ean;
    try {
      const discovered = await discoverProductEditor(ean, "KAUFLAND");
      setDiscover(limitDiscoverToActiveGroup(discovered, "KAUFLAND"));
      if (getTabSearchStatus(discovered, tabKey) !== "found") return false;
      return loadKauflandDraftForTab(ean, tabKey, getPreferredTargetIdForTab(discovered, tabKey));
    } finally {
      if (kauflandLoadInFlightEanRef.current === ean) kauflandLoadInFlightEanRef.current = null;
    }
  }

  async function loadOttoDraft(currentDiscover: ProductEditorDiscoverResponse, preferredTargetId?: string | null) {
    const tabKey = getOttoTabKey(activeTabKey) ?? "OTTO_JV";
    try {
      await loadOttoDraftForTab(currentDiscover.ean, tabKey, preferredTargetId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "OTTO draft load failed.";
      setPageError(message);
      showToast(message, "error");
    }
  }

  async function loadOttoDraftByEan(ean: string, tabKey: OttoTabKey = "OTTO_JV"): Promise<boolean> {
    const discovered = await discoverProductEditor(ean, "OTTO");
    setDiscover(limitDiscoverToActiveGroup(discovered, "OTTO"));
    if (getTabSearchStatus(discovered, tabKey) !== "found") return false;
    return loadOttoDraftForTab(ean, tabKey, getPreferredTargetIdForTab(discovered, tabKey));
  }

  async function loadHoodDraftByEan(ean: string, tabKeyOverride?: HoodTabKey): Promise<boolean> {
    const tabKey = tabKeyOverride ?? getHoodTabKey(activeTabKey) ?? "HOOD_JV";
    setHoodTabLoading(tabKey, true);
    try {
      const account = getHoodAccountFromTab(tabKey);
      const { response, payload } = await fetchHoodByEan(ean, account);
      if (!response.ok) {
        throw new Error(payload.detail || t.productEditorHoodLoadFailedHttp.replace("{status}", String(response.status)));
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

  async function loadJvDraftForTab(ean: string, tabKey: JvTabKey, baselineTargetId?: string | null): Promise<boolean> {
    const activeGroup = tabKey === "XL" ? "XL" : "JV";
    const autoLoadKey = buildJvAutoLoadKey(ean, baselineTargetId);
    setJvTabLoading(tabKey, true);
    try {
      const response = await loadProductEditorGroup({ ean, activeGroup, baselineTargetId });
      const hydrated = hydrateJvDraft(response.draft as never);
      if (!response.supported || !hydrated.target_id) return false;
      setJvTabDraft(tabKey, hydrated);
      setInitialJvTabDraft(tabKey, hydrated);
      setJvTabWarnings(tabKey, response.warnings);
      loadedJvAutoLoadKeyRef.current = buildJvAutoLoadKey(ean, baselineTargetId ?? response.baseline_target_id);
      clearPlanAndJobState();
      if (activeGroup === "JV") {
        void loadJvPublishingSelections(ean, tabKey);
      }
      return true;
    } finally {
      if (jvAutoLoadInFlightKeyRef.current === autoLoadKey) jvAutoLoadInFlightKeyRef.current = null;
      setJvTabLoading(tabKey, false);
    }
  }

  async function loadJvPublishingSelections(ean: string, tabKey: JvTabKey): Promise<void> {
    const loadKey = `${ean}:${tabKey}`;
    if (jvPublishingSelectionsLoadKeyRef.current === loadKey) return;
    jvPublishingSelectionsLoadKeyRef.current = loadKey;
    const publishingSiteKeys = ["JV_AT", "JV_CH", "JV_CO_UK"] as const;
    try {
      for (const publishingTargetId of publishingSiteKeys) {
        try {
          const response = await loadProductEditorGroup({
            ean,
            activeGroup: "JV",
            baselineTargetId: "JV_DE",
            publishingTargetId,
          });
          if (!response.supported) continue;

          const publishingDraft = response.draft as unknown as Partial<ProductEditorJvDraft>;
          const categoriesBySiteKey = publishingDraft.categories_by_site_key ?? {};
          const fieldsBySiteKey = publishingDraft.jv_fields_by_site_key ?? {};
          if (!Object.keys(categoriesBySiteKey).length && !Object.keys(fieldsBySiteKey).length) continue;

          setJvDraftsByTab((current) => {
            const draft = current[tabKey];
            if (draft.ean !== ean) return current;
            return {
              ...current,
              [tabKey]: {
                ...draft,
                categories_by_site_key: { ...draft.categories_by_site_key, ...categoriesBySiteKey },
                jv_fields_by_site_key: { ...draft.jv_fields_by_site_key, ...fieldsBySiteKey },
              },
            };
          });
          setInitialJvDraftsByTab((current) => {
            const draft = current[tabKey];
            if (draft.ean !== ean) return current;
            return {
              ...current,
              [tabKey]: {
                ...draft,
                categories_by_site_key: { ...draft.categories_by_site_key, ...categoriesBySiteKey },
                jv_fields_by_site_key: { ...draft.jv_fields_by_site_key, ...fieldsBySiteKey },
              },
            };
          });
        } catch {
          // The baseline stays usable if an optional per-site publishing lookup fails.
        }
      }
    } finally {
      if (jvPublishingSelectionsLoadKeyRef.current === loadKey) {
        jvPublishingSelectionsLoadKeyRef.current = null;
      }
    }
  }

  async function loadKauflandDraftForTab(ean: string, tabKey: KauflandTabKey, baselineTargetId?: string | null): Promise<boolean> {
    setKauflandTabLoading(tabKey, true);
    try {
      const response = await loadProductEditorGroup({ ean, activeGroup: "KAUFLAND", baselineTargetId });
      const hydrated = hydrateKauflandDraft(response.draft as unknown as ProductEditorKauflandDraft);
      if (!response.supported || !hydrated.target_id) return false;
      setKauflandTabDraft(tabKey, hydrated);
      setInitialKauflandTabDraft(tabKey, hydrated);
      setKauflandTabWarnings(tabKey, response.warnings);
      clearPlanAndJobState();
      return true;
    } finally {
      if (kauflandLoadInFlightEanRef.current === ean) kauflandLoadInFlightEanRef.current = null;
      setKauflandTabLoading(tabKey, false);
    }
  }

  async function loadOttoDraftForTab(ean: string, tabKey: OttoTabKey, baselineTargetId?: string | null): Promise<boolean> {
    setOttoTabLoading(tabKey, true);
    try {
      const response = await loadProductEditorGroup({ ean, activeGroup: "OTTO", baselineTargetId });
      const hydrated = hydrateOttoDraft(response.draft as unknown as ProductEditorOttoDraft);
      if (!response.supported || !hydrated.productReference) return false;
      setOttoTabDraft(tabKey, hydrated);
      setInitialOttoTabDraft(tabKey, hydrated);
      setOttoTabWarnings(tabKey, response.warnings);
      clearPlanAndJobState();
      return true;
    } finally {
      setOttoTabLoading(tabKey, false);
    }
  }

  async function preloadGlobalTab(
    tabKey: string,
    response: ProductEditorDiscoverResponse,
    requestVersion: number,
  ): Promise<void> {
    if (discoverRequestVersionRef.current !== requestVersion || getTabSearchStatus(response, tabKey) !== "found") return;

    try {
      const baselineTargetId = getPreferredTargetIdForTab(response, tabKey);
      if (tabKey === "JV" || tabKey === "XL") {
        await loadJvDraftForTab(response.ean, tabKey, baselineTargetId);
      } else if (tabKey === "HOOD_JV" || tabKey === "HOOD_XL") {
        await loadHoodDraftByEan(response.ean, tabKey);
      } else if (tabKey === "KAUFLAND_JV" || tabKey === "KAUFLAND_XL") {
        await loadKauflandDraftForTab(response.ean, tabKey, baselineTargetId);
      } else if (tabKey === "OTTO_JV" || tabKey === "OTTO_XL") {
        await loadOttoDraftForTab(response.ean, tabKey, baselineTargetId);
      }
    } catch {
      // The tab remains "found" because discovery succeeded; loading a draft is a separate concern.
    }
  }

  function patchActiveTabEan(value: string) {
    setTabEanInputs((current) => ({ ...current, [activeTabKey]: value }));
  }

  function markTabDirty(tabKey: string) {
    setDirtyTabKeys((current) => {
      if (current.has(tabKey)) return current;
      const next = new Set(current);
      next.add(tabKey);
      return next;
    });
  }

  function patchHoodDraft(patch: Partial<ProductEditorHoodDraft>) {
    const tabKey = getHoodTabKey(activeTabKey);
    if (!tabKey) return;
    setHoodDraftsByTab((current) => ({
      ...current,
      [tabKey]: { ...current[tabKey], ...patch }
    }));
    markTabDirty(tabKey);
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
    const tabKey = getJvTabKey(activeTabKey);
    if (!tabKey) return;
    setJvDraftsByTab((current) => ({ ...current, [tabKey]: { ...current[tabKey], ...patch } }));
    markTabDirty(tabKey);
    clearPlanStateOnly();
  }

  function patchKauflandDraft(patch: Partial<ProductEditorKauflandDraft>) {
    const tabKey = getKauflandTabKey(activeTabKey);
    if (!tabKey) return;
    setKauflandDraftsByTab((current) => ({ ...current, [tabKey]: { ...current[tabKey], ...patch } }));
    markTabDirty(tabKey);
    clearPlanStateOnly();
  }

  function patchOttoDraft(patch: Partial<ProductEditorOttoDraft>) {
    const tabKey = getOttoTabKey(activeTabKey);
    if (!tabKey) return;
    setOttoDraftsByTab((current) => ({ ...current, [tabKey]: { ...current[tabKey], ...patch } }));
    markTabDirty(tabKey);
    clearPlanStateOnly();
  }

  async function uploadJvImagesForSite(input: {
    siteKey: ProductEditorJvSiteKey;
    files?: File[];
    sourceUrls?: string[];
    imageRole: "main" | "additional";
    ean: string;
    artikelnr: string;
  }) {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= JV_IMAGE_UPLOAD_MAX_ATTEMPTS_PER_SITE; attempt += 1) {
      try {
        return await uploadProductEditorImages({
          files: input.files ?? [],
          sourceUrls: input.sourceUrls ?? [],
          site: "JV",
          siteKey: input.siteKey,
          ean: input.ean,
          artikelnr: input.artikelnr,
          imageRole: input.imageRole
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(t.productEditorJvImageUploadFailed);
        if (attempt >= JV_IMAGE_UPLOAD_MAX_ATTEMPTS_PER_SITE) {
          break;
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, JV_IMAGE_UPLOAD_RETRY_DELAY_MS));
      }
    }
    throw lastError ?? new Error(t.productEditorJvImageUploadFailed);
  }

  type JvGalleryUploadSource = {
    raw: string;
    preview: string;
    file: File | null;
  };

  function normalizeJvPreviewUrl(raw: string, explicitPublicUrl?: string): string {
    const publicUrl = String(explicitPublicUrl ?? "").trim();
    if (publicUrl) return publicUrl;
    const normalizedRaw = String(raw || "").trim();
    if (!normalizedRaw) return "";
    if (/^(https?:)?\/\//i.test(normalizedRaw) || normalizedRaw.startsWith("blob:") || normalizedRaw.startsWith("data:")) {
      return normalizedRaw;
    }
    if (normalizedRaw.startsWith("cosmoshop/")) return `https://www.jvmoebel.de/${normalizedRaw}`;
    if (normalizedRaw.startsWith("/cosmoshop/")) return `https://www.jvmoebel.de${normalizedRaw}`;
    if (normalizedRaw.startsWith("/")) return `https://www.jvmoebel.de${normalizedRaw}`;
    return `https://www.jvmoebel.de/${normalizedRaw}`;
  }

  function buildJvGalleryUploadSources(currentDraft: ProductEditorJvDraft): { mainSource: JvGalleryUploadSource | null; additionalSources: JvGalleryUploadSource[] } {
    const pendingFilesByPreview = new Map(
      currentDraft.pending_uploads
        .filter((item) => item.file instanceof File && String(item.preview_url || "").trim())
        .map((item) => [String(item.preview_url || "").trim(), item.file as File])
    );

    const mainPreview = normalizeJvPreviewUrl(currentDraft.image, currentDraft.image_public_url);
    const mainSource = mainPreview
      ? {
          raw: String(currentDraft.image || "").trim(),
          preview: mainPreview,
          file: pendingFilesByPreview.get(mainPreview) ?? pendingFilesByPreview.get(String(currentDraft.image || "").trim()) ?? null
        }
      : null;

    const additionalSources = currentDraft.images
      .map((row) => {
        const raw = String(row.image || "").trim();
        const preview = normalizeJvPreviewUrl(raw, row.public_url);
        if (!preview) return null;
        return {
          raw,
          preview,
          file: pendingFilesByPreview.get(preview) ?? pendingFilesByPreview.get(raw) ?? null
        } satisfies JvGalleryUploadSource;
      })
      .filter((row): row is JvGalleryUploadSource => Boolean(row));

    return { mainSource, additionalSources };
  }

  function deriveJvArtikelNr(currentDraft: ProductEditorJvDraft): string {
    const candidates = [
      currentDraft.jv_fields?.artikelnr,
      currentDraft.source_model,
      currentDraft.source_sku,
      currentDraft.source_ean_field,
      currentDraft.ean
    ];
    for (const value of candidates) {
      const normalized = String(value ?? "").trim();
      if (normalized) return normalized;
    }
    return currentDraft.ean.trim();
  }

  async function uploadSingleJvGalleryAsset(input: {
    siteKey: ProductEditorJvSiteKey;
    source: JvGalleryUploadSource;
    imageRole: "main" | "additional";
    ean: string;
    artikelnr: string;
  }) {
    if (input.source.file) {
      return uploadJvImagesForSite({
        siteKey: input.siteKey,
        files: [input.source.file],
        imageRole: input.imageRole,
        ean: input.ean,
        artikelnr: input.artikelnr
      });
    }
    return uploadJvImagesForSite({
      siteKey: input.siteKey,
      sourceUrls: [input.source.preview],
      imageRole: input.imageRole,
      ean: input.ean,
      artikelnr: input.artikelnr
    });
  }

  async function synchronizeJvGalleryAssets(currentDraft: ProductEditorJvDraft, selectedTargetIds: ProductEditorJvSiteKey[]): Promise<ProductEditorJvDraft> {
    const { mainSource, additionalSources } = buildJvGalleryUploadSources(currentDraft);
    if (!mainSource && additionalSources.length === 0) {
      return currentDraft;
    }

    const baselineSiteKey = currentDraft.target_id as ProductEditorJvSiteKey;
    const targetSiteKeys = [
      baselineSiteKey,
      ...Array.from(new Set(selectedTargetIds.filter((item) => item !== baselineSiteKey)))
    ];
    const artikelnr = deriveJvArtikelNr(currentDraft);

    let baselineMainUpload: Awaited<ReturnType<typeof uploadJvImagesForSite>> | null = null;
    const baselineAdditionalUploads: Array<Awaited<ReturnType<typeof uploadJvImagesForSite>>> = [];

    for (const siteKey of targetSiteKeys) {
      let currentMainUpload: Awaited<ReturnType<typeof uploadJvImagesForSite>> | null = null;
      const currentAdditionalUploads: Array<Awaited<ReturnType<typeof uploadJvImagesForSite>>> = [];

      if (mainSource) {
        currentMainUpload = await uploadSingleJvGalleryAsset({
          siteKey,
          source: mainSource,
          imageRole: "main",
          ean: currentDraft.ean,
          artikelnr
        });
      }

      for (const source of additionalSources) {
        currentAdditionalUploads.push(await uploadSingleJvGalleryAsset({
          siteKey,
          source,
          imageRole: "additional",
          ean: currentDraft.ean,
          artikelnr
        }));
      }

      if (siteKey === baselineSiteKey) {
        baselineMainUpload = currentMainUpload;
        baselineAdditionalUploads.push(...currentAdditionalUploads);
        continue;
      }

      if (
        baselineMainUpload &&
        currentMainUpload &&
        JSON.stringify(currentMainUpload.uploaded_image_urls) !== JSON.stringify(baselineMainUpload.uploaded_image_urls)
      ) {
        throw new Error(t.productEditorJvUploadPathMismatch.replace("{siteKey}", siteKey));
      }

      if (currentAdditionalUploads.length !== baselineAdditionalUploads.length) {
        throw new Error(t.productEditorJvUploadCountMismatch.replace("{siteKey}", siteKey));
      }
      for (let index = 0; index < currentAdditionalUploads.length; index += 1) {
        if (String(currentAdditionalUploads[index]?.image || "").trim() !== String(baselineAdditionalUploads[index]?.image || "").trim()) {
          throw new Error(t.productEditorJvUploadPathMismatch.replace("{siteKey}", siteKey));
        }
      }
    }

    const nextImage = String(baselineMainUpload?.image || mainSource?.raw || currentDraft.image).trim();
    const nextImagePublicUrl = String(baselineMainUpload?.image_public_url || mainSource?.preview || currentDraft.image_public_url).trim();
    const nextImages = currentDraft.images.map((row, index) => {
      const uploaded = baselineAdditionalUploads[index];
      if (!uploaded) {
        return row;
      }
      return {
        image: String(uploaded.image || row.image).trim(),
        public_url: String(uploaded.image_public_url || row.public_url || row.image).trim(),
        sort_order: Number(row.sort_order ?? index)
      };
    });

    return {
      ...currentDraft,
      image: nextImage,
      image_public_url: nextImagePublicUrl,
      images: nextImages,
      pending_uploads: []
    };
  }

  async function handleReviewChanges() {
    const { activeDraft, changedFields, selectedTargetIds } = getPlanContext();
    if (!activeDraft || changedFields.length === 0) {
      showToast(t.productEditorNoDraftChanges, "error");
      return;
    }
    const planEan = getPlanEan(activeDraft);
    if (!isValidProductIdentifier(planEan)) {
      showToast(t.productEditorInvalidIdentifier, "error");
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
      showToast(t.productEditorPlanGenerated.replace("{targets}", response.targets.map((target) => target.label).join(", ")), "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : t.productEditorPlanFailed;
      setPageError(message);
      showToast(message, "error");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleApplySelectedMarketplaces(selectedTabKeys: string[]) {
    const selectedTabKeySet = new Set(selectedTabKeys);
    const selectedChanges = changedMarketplacePlans.filter((change) => selectedTabKeySet.has(change.tabKey));
    if (selectedChanges.length === 0) {
      showToast(t.productEditorNoDraftChanges, "error");
      return;
    }

    setBatchEditResults([]);
    setGlobalPlanLoading(true);
    setPageError(null);
    let plans: ProductEditorPlannedMarketplace[];
    try {
      plans = [];
      for (const change of selectedChanges) {
        const preparedChange = await prepareMarketplaceChangeForPlan(change);
        const plan = await planProductEditor({
          ean: preparedChange.ean,
          activeGroup: preparedChange.groupId,
          changedFields: preparedChange.changedFields,
          draft: preparedChange.draft,
          selectedTargetIds: preparedChange.selectedTargetIds,
        });
        plans.push({ change: preparedChange, plan });
      }
      setGlobalPlans(plans);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.productEditorPlanFailed;
      setPageError(message);
      showToast(message, "error");
      return;
    } finally {
      setGlobalPlanLoading(false);
    }

    setGlobalApplyLoading(true);
    try {
      const results = await Promise.allSettled(plans.map(async (item) => {
        const response = await applyProductEditorPlan(item.plan.plan_id);
        const finalJob = await waitForOrchestratorJobToFinish(response.job_id);
        return { item, response, finalJob };
      }));
      const completedTabs = new Set<string>();
      const batchResults: ProductEditorBatchEditResult[] = [];

      results.forEach((result, index) => {
        const planItem = plans[index];
        const group = findGroup(discover, planItem.change.groupId);
        if (result.status === "rejected") {
          planItem.change.selectedTargetIds.forEach((targetId) => {
            batchResults.push({
              targetId,
              label: findTarget(group, targetId)?.label ?? targetId,
              status: "failed",
              errorMessage: result.reason instanceof Error ? result.reason.message : "Update request failed.",
            });
          });
          return;
        }

        setApplyResponse(result.value.response);
        setJobResponse(result.value.finalJob);
        const targetResults = result.value.finalJob.targets.length > 0
          ? result.value.finalJob.targets
          : planItem.change.selectedTargetIds.map((targetId) => ({
            target_id: targetId,
            status: "failed" as const,
            status_code: 0,
          }));
        targetResults.forEach((target) => {
          batchResults.push({
            targetId: target.target_id,
            label: findTarget(group, target.target_id)?.label ?? target.target_id,
            status: target.status,
            errorMessage: "error" in target ? target.error?.message : "Update status was not returned.",
          });
        });
        if (targetResults.every((target) => target.status === "success")) {
          completedTabs.add(planItem.change.tabKey);
          markMarketplaceChangeApplied(planItem.change);
        }
      });

      setBatchEditResults(batchResults);
      setGlobalPlans((current) => current.filter((item) => !completedTabs.has(item.change.tabKey)));
      const successfulCount = batchResults.filter((result) => result.status === "success").length;
      const failedCount = batchResults.length - successfulCount;
      if (failedCount === 0) {
        showToast(`${successfulCount} site(s) updated.`, "success");
      }
    } finally {
      setGlobalApplyLoading(false);
    }
  }

  async function prepareMarketplaceChangeForPlan(change: ProductEditorChangedMarketplace): Promise<ProductEditorChangedMarketplace> {
    if (change.groupId !== "JV" && change.groupId !== "XL") return change;
    const draft = change.draft as unknown as ProductEditorJvDraft;
    const requiresImageSync = draft.pending_uploads.length > 0 || change.changedFields.includes("image") || change.changedFields.includes("images");
    if (!requiresImageSync) return change;

    const synchronizedDraft = await synchronizeJvGalleryAssets(draft, change.selectedTargetIds as ProductEditorJvSiteKey[]);
    const tabKey = getJvTabKey(change.tabKey);
    if (tabKey) setJvTabDraft(tabKey, synchronizedDraft);
    return { ...change, draft: synchronizedDraft as unknown as Record<string, unknown> };
  }

  function markMarketplaceChangeApplied(change: ProductEditorChangedMarketplace) {
    const hoodTabKey = getHoodTabKey(change.tabKey);
    if (hoodTabKey) {
      setInitialHoodTabDraft(hoodTabKey, change.draft as unknown as ProductEditorHoodDraft);
      return;
    }
    const jvTabKey = getJvTabKey(change.tabKey);
    if (jvTabKey) {
      setInitialJvTabDraft(jvTabKey, change.draft as unknown as ProductEditorJvDraft);
      return;
    }
    const kauflandTabKey = getKauflandTabKey(change.tabKey);
    if (kauflandTabKey) {
      setInitialKauflandTabDraft(kauflandTabKey, change.draft as unknown as ProductEditorKauflandDraft);
      return;
    }
    const ottoTabKey = getOttoTabKey(change.tabKey);
    if (ottoTabKey) {
      setInitialOttoTabDraft(ottoTabKey, change.draft as unknown as ProductEditorOttoDraft);
    }
  }

  async function handleApplyJvEditedProducts() {
    const activeStructuredGroup = activeGroupId === "XL" ? "XL" : "JV";
    const activeStructuredLabel = activeStructuredGroup === "XL" ? "XL" : "JV";
    const ean = jvDraft.ean.trim();
    if (!/^\d{13}$/.test(ean)) {
      showToast(`${activeStructuredLabel} EAN is invalid.`, "error");
      return;
    }
    if (jvChangedFields.length === 0) {
      showToast(`No edited ${activeStructuredLabel} fields to apply.`, "error");
      return;
    }
    const selectedTargetIds = getJvTargetIdsForPlan(
      discover,
      activeStructuredGroup,
      jvDraft.target_id
    ) as ProductEditorJvSiteKey[];
    if (selectedTargetIds.length === 0) {
      showToast(`No found ${activeStructuredLabel} targets are available for orchestrator apply.`, "error");
      return;
    }
    setJvBatchApplyLoading(true);
    setPageError(null);
    setJobResponse({
      request_id: "",
      job_id: "",
      status: "running",
      active_group: activeStructuredGroup,
      summary: {
        supported: true,
        success: 0,
        failed: 0,
        total: 0,
        applied: 0,
        skipped: 0,
        progress_phase: "planning",
        progress_message: t.productEditorPreparingOrchestratorPlan
      },
      targets: [],
      error: null
    });
    let acceptedJobId = "";
    try {
      const requiresImageSync = jvDraft.pending_uploads.length > 0 || jvChangedFields.includes("image") || jvChangedFields.includes("images");
      const draftAfterUpload = requiresImageSync
        ? await synchronizeJvGalleryAssets(jvDraft, selectedTargetIds)
        : jvDraft;
      const tabKey = getJvTabKey(activeTabKey);
      if (tabKey) setJvTabDraft(tabKey, draftAfterUpload);
      const plan = await planProductEditor({
        ean,
        activeGroup: activeStructuredGroup,
        changedFields: jvChangedFields,
        draft: jvDraft as unknown as Record<string, unknown>,
        selectedTargetIds
      });
      setPlanResponse(plan);
      const response = await applyProductEditorPlan(plan.plan_id);
      setApplyResponse(response);
      acceptedJobId = response.job_id;
      setJobResponse({
        request_id: response.request_id,
        job_id: response.job_id,
        status: response.status,
        active_group: response.active_group,
        summary: { supported: true, success: 0, failed: 0 },
        targets: [],
        error: null
      });
      showToast(`${activeStructuredLabel} orchestrator apply accepted for job ${response.job_id.slice(0, 8)}.`, "success");
      const finalJob = await waitForOrchestratorJobToFinish(response.job_id);
      const finalStatus = String(finalJob.status || "").toLowerCase();
      const summary = finalJob.summary ?? {};
      const success = Number(summary.success ?? 0);
      const failed = Number(summary.failed ?? 0);
      if (finalStatus === "completed") {
        const tabKey = getJvTabKey(activeTabKey);
        if (tabKey) setInitialJvTabDraft(tabKey, jvDraft);
        showToast(`${activeStructuredLabel} orchestrator job completed. Success: ${success}, Failed: ${failed}.`, "success");
      } else {
        showToast(
          `${activeStructuredLabel} orchestrator job finished with status ${finalStatus || "unknown"}. Success: ${success}, Failed: ${failed}.`,
          "error"
        );
      }
    } catch (error) {
      if (!acceptedJobId) {
        setJobResponse(null);
      }
      const message = error instanceof Error ? error.message : `${activeStructuredLabel} batch apply failed.`;
      setPageError(message);
      showToast(message, "error");
    } finally {
      setJvBatchApplyLoading(false);
    }
  }

  async function handleApplyKauflandEditedProducts() {
    const ean = kauflandDraft.ean.trim();
    if (!isValidProductIdentifier(ean)) {
      showToast("Kaufland EAN is invalid.", "error");
      return;
    }
    if (kauflandChangedFields.length === 0) {
      showToast("No edited Kaufland fields to apply.", "error");
      return;
    }
    const selectedTargetIds = getTargetIdsForTab(discover, activeTabKey, ["found", "missing"]);
    if (selectedTargetIds.length === 0) {
      showToast("No reachable Kaufland targets are available for apply.", "error");
      return;
    }
    setKauflandApplyLoading(true);
    setPageError(null);
    try {
      const plan = await planProductEditor({
        ean,
        activeGroup: "KAUFLAND",
        changedFields: kauflandChangedFields,
        draft: kauflandDraft as unknown as Record<string, unknown>,
        selectedTargetIds
      });
      setPlanResponse(plan);
      const response = await applyProductEditorPlan(plan.plan_id);
      setApplyResponse(response);
      const finalJob = await waitForOrchestratorJobToFinish(response.job_id);
      if (String(finalJob.status).toLowerCase() === "completed") {
        const tabKey = getKauflandTabKey(activeTabKey);
        if (tabKey) setInitialKauflandTabDraft(tabKey, kauflandDraft);
        showToast("Kaufland changes applied.", "success");
      } else {
        showToast("Kaufland apply completed with failed targets.", "error");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kaufland apply failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setKauflandApplyLoading(false);
    }
  }

  async function handleApplyOttoEditedProducts() {
    const ean = ottoDraft.ean.trim();
    if (!isValidProductIdentifier(ean) || ottoChangedFields.length === 0) {
      showToast(!isValidProductIdentifier(ean) ? "OTTO EAN is invalid." : "No edited OTTO fields to apply.", "error");
      return;
    }
    const selectedTargetIds = ottoDraft.target_id.trim()
      ? [ottoDraft.target_id]
      : getTargetIdsForTab(discover, activeTabKey, ["found"]);
    if (selectedTargetIds.length === 0) {
      showToast("No reachable OTTO targets are available for apply.", "error");
      return;
    }
    setOttoApplyLoading(true);
    try {
      const plan = await planProductEditor({ ean, activeGroup: "OTTO", changedFields: ottoChangedFields, draft: ottoDraft as unknown as Record<string, unknown>, selectedTargetIds });
      setPlanResponse(plan);
      const response = await applyProductEditorPlan(plan.plan_id);
      setApplyResponse(response);
      const finalJob = await waitForOrchestratorJobToFinish(response.job_id);
      if (String(finalJob.status).toLowerCase() === "completed") {
        const tabKey = getOttoTabKey(activeTabKey);
        if (tabKey) setInitialOttoTabDraft(tabKey, ottoDraft);
        showToast("OTTO changes applied.", "success");
      } else {
        showToast("OTTO apply completed with failed targets.", "error");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "OTTO apply failed.";
      setPageError(message);
      showToast(message, "error");
    } finally {
      setOttoApplyLoading(false);
    }
  }

  function handleRemoveHoodImage(imageUrl: string) {
    applyHoodImagesUpdate(removeHoodImage(hoodDraft.images, imageUrl));
  }

  function handleReorderHoodImages(sourceImageUrl: string, targetImageUrl: string) {
    applyHoodImagesUpdate(reorderHoodImages(hoodDraft.images, sourceImageUrl, targetImageUrl));
  }

  async function uploadHoodImageFiles(input: {
    ean: string;
    account: "jv" | "xl";
    files: File[];
    role: "main" | "additional";
  }): Promise<string[]> {
    const { response, payload } = await patchHoodByEan({
      ean: input.ean,
      account: input.account,
      payloadObject: {},
      changedKeys: [],
      patchFiles: input.files,
      uploadOnly: true
    });
    if (!response.ok) {
      const detail =
        payload && typeof payload === "object" && "detail" in (payload as Record<string, unknown>)
          ? String((payload as Record<string, unknown>).detail || "")
          : "";
      throw new Error(detail || `${t.productEditorFtpUploadFailed} HTTP ${response.status}`);
    }

    const uploadedUrls =
      payload && typeof payload === "object" && Array.isArray((payload as { uploaded_image_urls?: unknown[] }).uploaded_image_urls)
        ? (payload as { uploaded_image_urls?: unknown[] }).uploaded_image_urls!.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
    if (uploadedUrls.length === 0) {
      throw new Error(t.productEditorFtpUploadNoUrls);
    }

    return uploadedUrls;
  }

  async function handleUploadHoodFiles(files: FileList | null) {
    const tabKey = getHoodTabKey(activeTabKey);
    if (!tabKey || !files || files.length === 0) return;

    const ean = hoodDraft.ean.trim();
    if (!isValidProductIdentifier(ean)) {
      showToast(t.productEditorLoadHoodBeforeUpload, "error");
      return;
    }

    setHoodTabImageUploadLoading(tabKey, true);
    setPageError(null);
    try {
      const selectedFiles = Array.from(files);
      let nextImages = hoodDraft.images;
      let uploadedCount = 0;

      if (nextImages.length === 0 && selectedFiles.length > 0) {
        const [mainFile, ...additionalFiles] = selectedFiles;
        const uploadedMainUrls = await uploadHoodImageFiles({
          ean,
          account: hoodDraft.account,
          files: [mainFile],
          role: "main"
        });
        nextImages = mergeHoodImageUrls(nextImages, uploadedMainUrls, "main");
        uploadedCount += uploadedMainUrls.length;

        if (additionalFiles.length > 0) {
          const uploadedAdditionalUrls = await uploadHoodImageFiles({
            ean,
            account: hoodDraft.account,
            files: additionalFiles,
            role: "additional"
          });
          nextImages = mergeHoodImageUrls(nextImages, uploadedAdditionalUrls, "additional");
          uploadedCount += uploadedAdditionalUrls.length;
        }
      } else {
        const uploadedAdditionalUrls = await uploadHoodImageFiles({
          ean,
          account: hoodDraft.account,
          files: selectedFiles,
          role: "additional"
        });
        nextImages = mergeHoodImageUrls(nextImages, uploadedAdditionalUrls, "additional");
        uploadedCount += uploadedAdditionalUrls.length;
      }

      applyHoodImagesUpdate(nextImages);
      showToast(t.productEditorUploadedHoodImages.replace("{count}", String(uploadedCount)), "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : t.productEditorFtpUploadFailed;
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
    if (!isValidProductIdentifier(ean)) {
      showToast(t.productEditorHoodIdentifierInvalid, "error");
      return;
    }

    const patchFiles = extractPendingUploadFiles(hoodDraft.pending_uploads);
    if (hoodChangedFields.length === 0 && patchFiles.length === 0) {
      showToast(t.productEditorNoEditedHoodFields, "error");
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
        throw new Error(detail || t.productEditorHoodUpdateFailedHttp.replace("{status}", String(response.status)));
      }
      const reloaded = await loadHoodDraftByEan(ean);
      if (!reloaded) {
        showToast(t.productEditorHoodUpdatedReloadMissing, "success");
      } else {
        showToast(t.productEditorHoodUpdatedSuccess, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t.productEditorHoodUpdateFailed;
      setPageError(message);
      showToast(message, "error");
    } finally {
      setHoodTabApplyLoading(tabKey, false);
    }
  }

  async function waitForOrchestratorJobToFinish(jobId: string) {
    const maxAttempts = 120;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await getProductEditorJob(jobId);
      setJobResponse(response);
      const statusValue = String(response.status || "").toLowerCase();
      if (statusValue !== "queued" && statusValue !== "running") {
        return response;
      }
      const delayMs =
        attempt <= 5 ? 3000 :
        attempt <= 20 ? 5000 :
        8000;
      await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
    }

    throw new Error(t.productEditorOrchestratorPollingTimedOut.replace("{jobId}", jobId));
  }

  async function handleApplyPlan() {
    if (!planResponse) return;
    setApplyLoading(true);
    setPageError(null);
    try {
      const response = await applyProductEditorPlan(planResponse.plan_id);
      setApplyResponse(response);
      showToast(t.productEditorApplyAcceptedShort.replace("{jobId}", response.job_id.slice(0, 8)), "success");
      await refreshJob(response.job_id, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.productEditorApplyFailed;
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
        showToast(
          t.productEditorJobLoadedStatus
            .replace("{jobId}", jobId.slice(0, 8))
            .replace("{status}", String(response.status)),
          "success"
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t.productEditorJobRefreshFailed;
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
    if (activeGroupId === "JV" || activeGroupId === "XL") {
      return {
        activeDraft: jvDraft,
        changedFields: jvChangedFields,
        selectedTargetIds: getJvTargetIdsForPlan(discover, activeGroupId, jvDraft.target_id)
      };
    }
    return { activeDraft: null, changedFields: [], selectedTargetIds: [] };
  }

  function clearPlanStateOnly() {
    setPlanResponse(null);
    setGlobalPlans([]);
    setApplyResponse(null);
    setApplyConfirmed(false);
    setGlobalApplyConfirmed(false);
  }

  function clearPlanAndJobState() {
    clearPlanStateOnly();
    setJobResponse(null);
  }

  function resetEditorState() {
    setDiscover(null);
    setTabSearchStatuses({});
    jvAutoLoadInFlightKeyRef.current = null;
    loadedJvAutoLoadKeyRef.current = null;
    kauflandLoadInFlightEanRef.current = null;
    autoLoadHandledKeysRef.current.clear();
    setDirtyTabKeys(new Set());
    setHoodDraftsByTab(createEmptyHoodDraftsByTab());
    setInitialHoodDraftsByTab(createEmptyHoodDraftsByTab());
    setHoodWarningsByTab(createEmptyHoodWarningsByTab());
    setHoodLoadingByTab(createEmptyHoodLoadingByTab());
    setHoodApplyLoadingByTab(createEmptyHoodLoadingByTab());
    setHoodImageUploadLoadingByTab(createEmptyHoodLoadingByTab());
    setJvDraftsByTab(createEmptyJvDraftsByTab());
    setInitialJvDraftsByTab(createEmptyJvDraftsByTab());
    setJvWarningsByTab(createEmptyJvWarningsByTab());
    setJvLoadingByTab(createEmptyJvLoadingByTab());
    setKauflandDraftsByTab(createEmptyKauflandDraftsByTab());
    setInitialKauflandDraftsByTab(createEmptyKauflandDraftsByTab());
    setKauflandWarningsByTab(createEmptyKauflandWarningsByTab());
    setKauflandLoadingByTab(createEmptyKauflandLoadingByTab());
    setOttoDraftsByTab(createEmptyOttoDraftsByTab());
    setInitialOttoDraftsByTab(createEmptyOttoDraftsByTab());
    setOttoWarningsByTab(createEmptyOttoWarningsByTab());
    setOttoLoadingByTab(createEmptyOttoLoadingByTab());
    setPlanResponse(null);
    setApplyResponse(null);
    setJobResponse(null);
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

  function setJvTabDraft(tabKey: JvTabKey, draft: ProductEditorJvDraft) {
    setJvDraftsByTab((current) => ({ ...current, [tabKey]: draft }));
  }

  function setInitialJvTabDraft(tabKey: JvTabKey, draft: ProductEditorJvDraft) {
    setInitialJvDraftsByTab((current) => ({ ...current, [tabKey]: draft }));
  }

  function setJvTabWarnings(tabKey: JvTabKey, warnings: ProductEditorDiscoverResponse["warnings"]) {
    setJvWarningsByTab((current) => ({ ...current, [tabKey]: warnings }));
  }

  function setJvTabLoading(tabKey: JvTabKey, loading: boolean) {
    setJvLoadingByTab((current) => ({ ...current, [tabKey]: loading }));
  }

  function setKauflandTabDraft(tabKey: KauflandTabKey, draft: ProductEditorKauflandDraft) {
    setKauflandDraftsByTab((current) => ({ ...current, [tabKey]: draft }));
  }

  function setInitialKauflandTabDraft(tabKey: KauflandTabKey, draft: ProductEditorKauflandDraft) {
    setInitialKauflandDraftsByTab((current) => ({ ...current, [tabKey]: draft }));
  }

  function setKauflandTabWarnings(tabKey: KauflandTabKey, warnings: ProductEditorDiscoverResponse["warnings"]) {
    setKauflandWarningsByTab((current) => ({ ...current, [tabKey]: warnings }));
  }

  function setKauflandTabLoading(tabKey: KauflandTabKey, loading: boolean) {
    setKauflandLoadingByTab((current) => ({ ...current, [tabKey]: loading }));
  }

  function setOttoTabDraft(tabKey: OttoTabKey, draft: ProductEditorOttoDraft) {
    setOttoDraftsByTab((current) => ({ ...current, [tabKey]: draft }));
  }

  function setInitialOttoTabDraft(tabKey: OttoTabKey, draft: ProductEditorOttoDraft) {
    setInitialOttoDraftsByTab((current) => ({ ...current, [tabKey]: draft }));
  }

  function setOttoTabWarnings(tabKey: OttoTabKey, warnings: ProductEditorDiscoverResponse["warnings"]) {
    setOttoWarningsByTab((current) => ({ ...current, [tabKey]: warnings }));
  }

  function setOttoTabLoading(tabKey: OttoTabKey, loading: boolean) {
    setOttoLoadingByTab((current) => ({ ...current, [tabKey]: loading }));
  }

  return (
    <AppShell title={t.navProductEditor} subtitle={t.productEditorWorkspaceSubtitle}>
      <div className="wh-product-editor-page flex min-h-[calc(100dvh-1.5rem)] w-full flex-col gap-[12px]">
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
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
            onEdit={() => setBatchEditDialogOpen(true)}
            canEdit={batchEditSites.length > 0 && !globalPlanLoading && !globalApplyLoading}
          >
            <Tabs value={activeTabKey} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid h-auto w-full min-w-max grid-cols-10 gap-2 overflow-x-auto bg-transparent p-0 md:min-w-0">
                {PRODUCT_EDITOR_DISPLAY_TABS.map((tab) => {
                  const searchStatus = tabSearchStatuses[tab.key] ?? "idle";
                  const statusLabel = searchStatus === "loading"
                    ? "Searching"
                    : searchStatus === "found"
                      ? "Product found"
                      : searchStatus === "missing"
                        ? "Product not found"
                        : searchStatus === "unavailable"
                          ? "Search unavailable"
                        : searchStatus === "error"
                          ? "Search failed"
                        : "Not searched";
                  return (
                    <TabsTrigger
                      key={tab.key}
                      value={tab.key}
                      title={`${getProductEditorDisplayTabLabel(tab.key, t)} — ${statusLabel}`}
                      className={cn(
                        "relative flex h-10 min-w-[110px] items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-border/70 bg-card px-3 text-xs font-semibold uppercase tracking-normal shadow-sm transition-[background-color,border-color,color] duration-200 hover:border-primary/35 hover:bg-primary/5 data-[state=active]:ring-2 data-[state=active]:ring-primary/20",
                        searchStatus === "loading" && "border-amber-300/80 bg-amber-50 text-amber-800",
                        searchStatus === "found" && "border-emerald-300/80 bg-emerald-50 text-emerald-800",
                        searchStatus === "missing" && "border-rose-300/80 bg-rose-50 text-rose-800",
                        searchStatus === "unavailable" && "border-amber-300/80 bg-amber-50 text-amber-800",
                        searchStatus === "error" && "border-rose-400 bg-rose-100 text-rose-950",
                      )}
                    >
                      <span>{getProductEditorDisplayTabLabel(tab.key, t)}</span>
                      {searchStatus === "loading" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                      {searchStatus === "found" ? <CircleCheck className="size-3.5" aria-hidden="true" /> : null}
                      {searchStatus === "missing" ? <CircleX className="size-3.5" aria-hidden="true" /> : null}
                      {searchStatus === "unavailable" ? <CircleX className="size-3.5" aria-hidden="true" /> : null}
                      {searchStatus === "error" ? <CircleX className="size-3.5" aria-hidden="true" /> : null}
                      <span className="sr-only">{statusLabel}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </ProductEditorHeaderCard>
          <ProductEditorBatchEditDialog
            open={batchEditDialogOpen}
            sites={batchEditSites}
            results={batchEditResults}
            loading={globalPlanLoading || globalApplyLoading}
            onOpenChange={setBatchEditDialogOpen}
            onApply={(tabKeys) => void handleApplySelectedMarketplaces(tabKeys)}
          />
        </motion.div>

        {pageError ? (
          <Card className="border-destructive/20 bg-destructive/10 text-destructive shadow-sm">
            <CardContent className="pt-0 text-sm">{pageError}</CardContent>
          </Card>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={!reducedMotion}>
            <motion.div
              key={activeTabKey}
              initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.992 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -8, scale: 0.996 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="min-h-0 w-full flex-1"
            >
              <ProductEditorActiveGroupPanel
            discover={discover}
            activeGroupId={activeGroupId}
            discoveryItems={discoveryItems}
            activeTabLabel={PRODUCT_EDITOR_DISPLAY_TABS.find((tab) => tab.key === activeTabKey)
              ? getProductEditorDisplayTabLabel(activeTabKey, t)
              : PRODUCT_EDITOR_TAB_COPY[activeGroupId].label}
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
            onUploadHoodFiles={(files) => void handleUploadHoodFiles(files)}
            onApplyHoodEditedProducts={() => void handleApplyHoodEditedProducts()}
            onApplyJvEditedProducts={() => void handleApplyJvEditedProducts()}
            kauflandDraft={kauflandDraft}
            kauflandWarnings={kauflandWarnings}
            kauflandLoading={kauflandLoading}
            kauflandChangedFields={kauflandChangedFields}
            kauflandApplyLoading={kauflandApplyLoading}
            onPatchKaufland={patchKauflandDraft}
            onApplyKauflandEditedProducts={() => void handleApplyKauflandEditedProducts()}
            ottoDraft={ottoDraft}
            ottoWarnings={ottoWarnings}
            ottoLoading={ottoLoading}
            ottoChangedFields={ottoChangedFields}
            ottoApplyLoading={ottoApplyLoading}
            onPatchOtto={patchOttoDraft}
            onApplyOttoEditedProducts={() => void handleApplyOttoEditedProducts()}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </AppShell>
  );
}

function limitDiscoverToActiveGroup(
  response: ProductEditorDiscoverResponse,
  activeGroup: ProductEditorGroupId | null
): ProductEditorDiscoverResponse {
  if (!activeGroup || (activeGroup !== "JV" && activeGroup !== "HOOD" && activeGroup !== "XL" && activeGroup !== "OTTO" && activeGroup !== "KAUFLAND")) {
    return response;
  }
  const activeGroupResponse = response.groups.find((group) => group.id === activeGroup);
  const normalizedGroup = activeGroup === "XL" && activeGroupResponse
    ? {
        ...activeGroupResponse,
        targets: activeGroupResponse.targets.filter((target) => target.id === "XLMOEBEL_DE"),
      }
    : activeGroupResponse;
  return {
    ...response,
    groups: normalizedGroup ? [normalizedGroup] : [],
    selected_group_id: activeGroup
  };
}

function findFirstFoundTarget(group: ReturnType<typeof findGroup>): ProductEditorTarget | null {
  return group?.targets.find((target) => target.status === "found") ?? null;
}

function isLoadedJvDraft(draft: ProductEditorJvDraft, ean: string): boolean {
  if (!Boolean(draft.target_id)) {
    return false;
  }

  const normalizedIdentifier = normalizeProductIdentifier(ean);
  if (!normalizedIdentifier) {
    return false;
  }

  const exactCandidates = [draft.ean, draft.source_ean_field, draft.source_model, draft.source_sku]
    .map(normalizeProductIdentifier)
    .filter(Boolean);

  if (exactCandidates.includes(normalizedIdentifier)) {
    return true;
  }

  const canonicalEanCandidates = [draft.ean, draft.source_ean_field]
    .map(extractCanonicalEan)
    .filter(Boolean);

  return canonicalEanCandidates.some((candidate) => normalizedIdentifier.includes(candidate));
}

function isLoadedKauflandDraft(draft: ProductEditorKauflandDraft, ean: string): boolean {
  return Boolean(draft.target_id) && draft.ean.trim() === ean.trim();
}

function normalizeProductIdentifier(value: string): string {
  return value.trim().toUpperCase();
}

function extractCanonicalEan(value: string): string {
  const match = normalizeProductIdentifier(value).match(/\d{13}/);
  return match ? match[0] : "";
}

function buildJvAutoLoadKey(ean: string, baselineTargetId?: string | null): string {
  return `${ean.trim()}::${String(baselineTargetId ?? "").trim()}`;
}

function getPlanEan(activeDraft: ProductEditorHoodDraft | ProductEditorJvDraft): string {
  return String(activeDraft.ean || "").trim();
}

const PRODUCT_EDITOR_DISPLAY_TABS: Array<{ key: string; groupId: ProductEditorGroupId }> = [
  { key: "JV", groupId: "JV" },
  { key: "XL", groupId: "XL" },
  { key: "HOOD_JV", groupId: "HOOD" },
  { key: "HOOD_XL", groupId: "HOOD" },
  { key: "KAUFLAND_JV", groupId: "KAUFLAND" },
  { key: "KAUFLAND_XL", groupId: "KAUFLAND" },
  { key: "OTTO_JV", groupId: "OTTO" },
  { key: "OTTO_XL", groupId: "OTTO" },
  { key: "EBAY_JV", groupId: "EBAY" },
  { key: "EBAY_XL", groupId: "EBAY" }
];

function getProductEditorDisplayTabLabel(tabKey: string, t: ReturnType<typeof useLabels>): string {
  switch (tabKey) {
    case "JV":
      return t.channelJv;
    case "XL":
      return t.channelXl;
    case "HOOD_JV":
      return `${t.channelHood} ${t.channelJv}`;
    case "HOOD_XL":
      return `${t.channelHood} ${t.channelXl}`;
    case "OTTO_JV":
      return `${t.channelOtto} ${t.channelJv}`;
    case "OTTO_XL":
      return `${t.channelOtto} ${t.channelXl}`;
    case "KAUFLAND_JV":
      return `${t.channelKaufland} ${t.channelJv}`;
    case "KAUFLAND_XL":
      return `${t.channelKaufland} ${t.channelXl}`;
    case "EBAY_JV":
      return `${t.channelEbay} ${t.channelJv}`;
    case "EBAY_XL":
      return `${t.channelEbay} ${t.channelXl}`;
    default:
      return tabKey;
  }
}

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

function createEmptyJvDraftsByTab(): DraftsByTab<ProductEditorJvDraft, JvTabKey> {
  return { JV: createEmptyJvDraft(), XL: createEmptyJvDraft() };
}

function createEmptyJvWarningsByTab(): WarningsByTab<JvTabKey> {
  return { JV: [], XL: [] };
}

function createEmptyJvLoadingByTab(): LoadingByTab<JvTabKey> {
  return { JV: false, XL: false };
}

function createEmptyKauflandDraftsByTab(): DraftsByTab<ProductEditorKauflandDraft, KauflandTabKey> {
  return { KAUFLAND_JV: createEmptyKauflandDraft(), KAUFLAND_XL: createEmptyKauflandDraft() };
}

function createEmptyKauflandWarningsByTab(): WarningsByTab<KauflandTabKey> {
  return { KAUFLAND_JV: [], KAUFLAND_XL: [] };
}

function createEmptyKauflandLoadingByTab(): LoadingByTab<KauflandTabKey> {
  return { KAUFLAND_JV: false, KAUFLAND_XL: false };
}

function createEmptyOttoDraftsByTab(): DraftsByTab<ProductEditorOttoDraft, OttoTabKey> {
  return { OTTO_JV: createEmptyOttoDraft(), OTTO_XL: createEmptyOttoDraft() };
}

function createEmptyOttoWarningsByTab(): WarningsByTab<OttoTabKey> {
  return { OTTO_JV: [], OTTO_XL: [] };
}

function createEmptyOttoLoadingByTab(): LoadingByTab<OttoTabKey> {
  return { OTTO_JV: false, OTTO_XL: false };
}

function getHoodTabKey(tabKey: string): HoodTabKey | null {
  if (tabKey === "HOOD_JV" || tabKey === "HOOD_XL") return tabKey;
  return null;
}

function getJvTabKey(tabKey: string): JvTabKey | null {
  return tabKey === "JV" || tabKey === "XL" ? tabKey : null;
}

function getKauflandTabKey(tabKey: string): KauflandTabKey | null {
  return tabKey === "KAUFLAND_JV" || tabKey === "KAUFLAND_XL" ? tabKey : null;
}

function getOttoTabKey(tabKey: string): OttoTabKey | null {
  return tabKey === "OTTO_JV" || tabKey === "OTTO_XL" ? tabKey : null;
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

function getGroupIdForTab(tabKey: string): ProductEditorGroupId {
  return PRODUCT_EDITOR_DISPLAY_TABS.find((item) => item.key === tabKey)?.groupId ?? "HOOD";
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
  if (!isValidProductIdentifier(ean) || !isValidProductIdentifier(draft.ean)) return false;
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
  if (!variant) return group.targets.find((target) => target.status === "found")?.id ?? null;
  const variantUpper = variant.toUpperCase();

  const matched = group.targets.find((target) => {
    if (target.status !== "found") return false;
    const id = String(target.id || "").toUpperCase();
    const family = String(target.account_family || "").toUpperCase();
    const label = String(target.label || "").toUpperCase();
    return id.includes(`_${variantUpper}`) || family === variantUpper || label.includes(variantUpper);
  });
  return matched?.id ?? null;
}

function getTargetIdsForTab(
  discover: ProductEditorDiscoverResponse | null,
  tabKey: string,
  allowedStatuses: Array<ProductEditorTarget["status"]>
): string[] {
  if (!discover) return [];
  const tab = PRODUCT_EDITOR_DISPLAY_TABS.find((item) => item.key === tabKey);
  if (!tab) return [];
  const group = findGroup(discover, tab.groupId);
  if (!group) return [];
  const variant = getSourceVariantFromTab(tabKey);
  const variantUpper = variant?.toUpperCase();

  return group.targets
    .filter((target) => allowedStatuses.includes(target.status))
    .filter((target) => {
      if (!variantUpper) return true;
      const id = String(target.id || "").toUpperCase();
      const family = String(target.account_family || "").toUpperCase();
      const label = String(target.label || "").toUpperCase();
      return id.includes(`_${variantUpper}`) || family === variantUpper || label.includes(variantUpper);
    })
    .map((target) => target.id);
}

function getJvTargetIdsForPlan(
  discover: ProductEditorDiscoverResponse | null,
  tabKey: JvTabKey,
  baselineTargetId: string
): string[] {
  const foundTargetIds = getTargetIdsForTab(discover, tabKey, ["found"]);
  const normalizedBaselineTargetId = baselineTargetId.trim();
  const requiredBaselineTargetId = tabKey === "JV"
    ? normalizedBaselineTargetId === "JV_DE" ? normalizedBaselineTargetId : ""
    : normalizedBaselineTargetId;

  return Array.from(new Set([
    ...(requiredBaselineTargetId ? [requiredBaselineTargetId] : []),
    ...foundTargetIds,
  ]));
}

export function ProductEditorShell() {
  return (
    <Suspense fallback={<LoadingState titleKey="productEditorLoadingWorkspace" />}>
      <ProductEditorContent />
    </Suspense>
  );
}
