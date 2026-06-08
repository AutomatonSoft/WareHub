"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { useLabels } from "../../../app/use-labels";
import {
  xljvGetDeliveryOptions,
  xljvGetProductByEan,
  xljvGetRubricsTree,
  xljvGetSitesByEan,
  xljvTakeNextEan,
  xljvUploadImages
} from "../xljv-api";
import {
  sendCreatedProduct,
  sendCreatedProductToAllSites,
  sendToSelectedSites,
  syncByEan
} from "../xljv-search-actions";
import {
  RubricTreeNode,
  SITE_KEY_OPTIONS,
  Site,
  SiteLanguageMapPreview,
  XLAllSitesResult,
  XLJVCreateFormState,
  XLJVResponse
} from "../xljv-search-utils";
import { buildXLJVWriteConfirmMessage } from "../xljv-write-guardrails-model";
import { getSendToSelectedSitesPrecheckError } from "../xljv-write-precheck-model";
import { getRequiredEanError } from "../../shared/write-guardrails-model";

export function useXLJVSearchController(initialSite?: Site) {
  const t = useLabels();
  const router = useRouter();
  const [ean, setEan] = useState("");
  const [site, setSite] = useState<Site>(initialSite || "XL");
  const [siteKey, setSiteKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [allXlLoading, setAllXlLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncLog, setSyncLog] = useState<Record<string, unknown> | null>(null);
  const [item, setItem] = useState<XLJVResponse | null>(null);
  const [allXlResult, setAllXlResult] = useState<XLAllSitesResult | null>(null);
  const [selectedSiteKeys, setSelectedSiteKeys] = useState<string[]>([]);
  const [templateSiteKey, setTemplateSiteKey] = useState("");
  const [createOrderLoading, setCreateOrderLoading] = useState(false);
  const [createProductLoading, setCreateProductLoading] = useState(false);
  const [createProductSendLoading, setCreateProductSendLoading] = useState(false);
  const [createImageUploadLoading, setCreateImageUploadLoading] = useState(false);
  const [createAllSitesLoading, setCreateAllSitesLoading] = useState(false);
  const [createImageFiles, setCreateImageFiles] = useState<File[]>([]);
  const [createForm, setCreateForm] = useState<XLJVCreateFormState | null>(null);
  const [rubricsLoading, setRubricsLoading] = useState(false);
  const [deliveryOptionsLoading, setDeliveryOptionsLoading] = useState(false);
  const [deliveryOptions, setDeliveryOptions] = useState<Array<{ id: number; label: string; is_default?: boolean }>>([]);
  const [rubrics, setRubrics] = useState<RubricTreeNode[]>([]);
  const [selectedRubricIds, setSelectedRubricIds] = useState<number[]>([]);
  const [mainRubricId, setMainRubricId] = useState<number | null>(null);
  const [sendSelectedLoading, setSendSelectedLoading] = useState(false);
  const [batchLanguageMaps, setBatchLanguageMaps] = useState<SiteLanguageMapPreview[]>([]);
  const [batchLanguageMapsAttempted, setBatchLanguageMapsAttempted] = useState(false);
  const [orderDraft, setOrderDraft] = useState<{ name: string; description: string; tag: string; meta_title: string; meta_description: string; meta_keyword: string; default_price: string } | null>(null);
  const [translateTexts, setTranslateTexts] = useState(true);
  const [autoDetectSourceLanguage, setAutoDetectSourceLanguage] = useState(true);
  const [convertCurrency, setConvertCurrency] = useState(true);

  const siteKeyOptions = useMemo(() => SITE_KEY_OPTIONS[site], [site]);
  const isAllSitesSelected = siteKey.trim() === "ALL_SITES";
  const getProductMutation = useMutation({ mutationFn: xljvGetProductByEan });
  const getSitesMutation = useMutation({ mutationFn: xljvGetSitesByEan });

  useEffect(() => { if (initialSite) setSite(initialSite); }, [initialSite]);
  useEffect(() => {
    if (!createForm || site !== "JV") return;
    void handleLoadDeliveryOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createForm?.ean, site, siteKey]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const eanError = getRequiredEanError(ean, t);
    if (eanError) return setError(eanError);
    setLoading(true); setError(null); setSyncStatus(null); setSyncLog(null); setItem(null); setAllXlResult(null);
    try {
      const { response, payload } = await getProductMutation.mutateAsync({ ean: ean.trim(), site, siteKey: isAllSitesSelected ? "" : siteKey });
      if (!response.ok) throw new Error(payload.detail || `${t.requestFailed}: HTTP ${response.status}`);
      setItem(payload);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message || t.failedToLoadItem : t.failedToLoadItem); }
    finally { setLoading(false); }
  }

  async function handleSearchAllSites() {
    const eanError = getRequiredEanError(ean, t);
    if (eanError) return setError(eanError);
    setAllXlLoading(true); setError(null); setAllXlResult(null);
    try {
      const { response, payload } = await getSitesMutation.mutateAsync({ ean: ean.trim(), site });
      if (!response.ok) throw new Error(payload.detail || `${t.requestFailed}: HTTP ${response.status}`);
      setAllXlResult(payload);
      const foundKeys = (payload.found ?? []).map((row) => row.site_key);
      setSelectedSiteKeys(foundKeys); setTemplateSiteKey(foundKeys[0] || ""); setOrderDraft(null);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message || t.failedSearchAllSites : t.failedSearchAllSites); }
    finally { setAllXlLoading(false); }
  }

  function toggleSelectedSite(key: string) { setSelectedSiteKeys((current) => (current.includes(key) ? current.filter((v) => v !== key) : [...current, key])); }
  function buildCategoriesJsonFromRubrics(ids: number[], mainId: number | null) { const rows = ids.map((id) => ({ category_id: id, main_category: mainId !== null ? id === mainId : false })); if (rows.length > 0 && !rows.some((x) => x.main_category)) rows[0].main_category = true; return JSON.stringify(rows, null, 2); }
  function handleToggleRubric(id: number) { setSelectedRubricIds((prev) => { const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]; const nextMain = mainRubricId !== null && next.includes(mainRubricId) ? mainRubricId : next[0] ?? null; setMainRubricId(nextMain); setCreateForm((p) => (p ? { ...p, categories_json: buildCategoriesJsonFromRubrics(next, nextMain) } : p)); return next; }); }
  function handleSetMainRubric(id: number) { setMainRubricId(id); setCreateForm((p) => (p ? { ...p, categories_json: buildCategoriesJsonFromRubrics(selectedRubricIds, id) } : p)); }

  async function handleLoadRubrics() {
    setRubricsLoading(true); setError(null);
    try {
      const fallbackSiteKey = siteKeyOptions.find((o) => { const value = (o.value || "").trim(); return Boolean(value) && value !== "ALL_SITES"; })?.value || "";
      const normalizedSiteKey = isAllSitesSelected ? fallbackSiteKey : (siteKey.trim() || fallbackSiteKey);
      const { response, payload } = await xljvGetRubricsTree({ site, siteKey: normalizedSiteKey, language: "de" });
      if (!response.ok) throw new Error(payload.detail || `${t.requestFailed}: HTTP ${response.status}`);
      setRubrics(Array.isArray(payload.items) ? payload.items : []);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message || "Failed to load rubrics." : "Failed to load rubrics."); }
    finally { setRubricsLoading(false); }
  }
  async function handleLoadDeliveryOptions() {
    if (site !== "JV") return;
    setDeliveryOptionsLoading(true); setError(null);
    try {
      const fallbackSiteKey = siteKeyOptions.find((o) => { const value = (o.value || "").trim(); return Boolean(value) && value !== "ALL_SITES"; })?.value || "";
      const normalizedSiteKey = isAllSitesSelected ? fallbackSiteKey : (siteKey.trim() || fallbackSiteKey);
      const { response, payload } = await xljvGetDeliveryOptions({ site, siteKey: normalizedSiteKey, language: "de" });
      if (!response.ok) throw new Error(payload.detail || `${t.requestFailed}: HTTP ${response.status}`);
      const items = Array.isArray(payload.items) ? payload.items : [];
      setDeliveryOptions(items);
      setCreateForm((prev) => { if (!prev) return prev; if (prev.jv_lieferzeitid && items.some((x) => String(x.id) === prev.jv_lieferzeitid)) return prev; const preferred = items.find((x) => x.is_default) || items[0]; return preferred ? { ...prev, jv_lieferzeitid: String(preferred.id) } : prev; });
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message || "Failed to load delivery options." : "Failed to load delivery options."); }
    finally { setDeliveryOptionsLoading(false); }
  }

  async function handleCreateProduct() {
    setCreateProductLoading(true); setError(null); setSyncStatus(null);
    try {
      const { response, payload: data } = await xljvTakeNextEan();
      if (!response.ok) throw new Error(String(data.detail || `${t.requestFailed}: HTTP ${response.status}`));
      const nextEan = String(data.ean || "").trim();
      if (!nextEan) throw new Error(t.eanPoolNoEan);
      setCreateForm({ ean: nextEan, source_product_id: "", source_model: nextEan, source_sku: "", source_ean_field: "", manufacturer_id: "", stock_status_id: "", tax_class_id: "", shipping: true, subtract: true, minimum: "1", points: "0", sort_order: "0", seo_url: "", date_available: "", image: "", categories_json: "[]", stores_json: "[]", images_json: "[]", specials_json: "[]", descriptions_json: "[]", price: "0.0000", quantity: "0", status: true, name: "", description: "", short_description: "", short_description_real: "", description_html: "", tag: "", meta_title: "", meta_description: "", meta_keyword: "", jv_urlkey: "", jv_uvp: "", jv_mwstid: "3", jv_lieferzeitid: "11", jv_einheitid: "6", jv_grundeinheit: "6", jv_vpe: "1", jv_preisbasis: "brutto", jv_preisfilter: "default", jv_is_sofort: true });
      setRubrics([]); setSelectedRubricIds([]); setMainRubricId(null); setEan(nextEan); setSyncStatus(`${t.draftOpenedWithEan} ${nextEan}. ${t.fillFieldsAndClickSend}`);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message || t.failedPrepareCreateForm : t.failedPrepareCreateForm); }
    finally { setCreateProductLoading(false); }
  }

  async function handleCreateImageUpload(files: FileList | null) {
    if (!files || files.length === 0 || !createForm) return;
    setCreateImageFiles(Array.from(files)); setCreateImageUploadLoading(true); setError(null);
    try {
      const fileList = Array.from(files);
      const concreteSiteKeys = siteKeyOptions.map((option) => String(option.value || "").trim()).filter((value) => Boolean(value) && value !== "ALL_SITES");
      const targetSiteKeys = isAllSitesSelected ? concreteSiteKeys : [siteKey.trim() || concreteSiteKeys[0] || ""].filter(Boolean);
      if (targetSiteKeys.length === 0) throw new Error("No concrete site keys configured for upload.");
      const mergedUrls: string[] = []; const uploadErrors: string[] = [];
      for (const targetSiteKey of targetSiteKeys) {
        const { response, payload: data } = await xljvUploadImages({ site, siteKey: targetSiteKey, ean: createForm.ean, files: fileList });
        if (!response.ok) { uploadErrors.push(`${targetSiteKey}: ${String(data.detail || `HTTP ${response.status}`)}`); continue; }
        const urls = Array.isArray(data.uploaded_image_urls) ? data.uploaded_image_urls.map((value) => String(value || "").trim()).filter(Boolean) : [];
        if (urls.length === 0) { uploadErrors.push(`${targetSiteKey}: ${t.uploadNoImageUrls}`); continue; }
        for (const url of urls) if (!mergedUrls.includes(url)) mergedUrls.push(url);
      }
      if (mergedUrls.length === 0) throw new Error(uploadErrors[0] || t.uploadNoImageUrls);
      setCreateForm((prev) => prev ? { ...prev, image: prev.image || mergedUrls[0], images_json: JSON.stringify(mergedUrls.slice(1).map((url, index) => ({ image: url, sort_order: index }))) } : prev);
      setSyncStatus(uploadErrors.length > 0 ? `${t.uploaded} ${mergedUrls.length} ${t.imagesToFtp}. Partial errors: ${uploadErrors.join(" | ")}` : isAllSitesSelected ? `${t.uploaded} ${mergedUrls.length} ${t.imagesToFtp} (${targetSiteKeys.length} sites).` : `${t.uploaded} ${mergedUrls.length} ${t.imagesToFtp}`);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message || t.failedUploadImageFiles : t.failedUploadImageFiles); }
    finally { setCreateImageUploadLoading(false); }
  }

  async function handleSendCreatedProductToAllSites() {
    if (!createForm) return setError(t.clickCreateFirst);
    if (!window.confirm(buildXLJVWriteConfirmMessage({ action: "send_all_sites", ean: createForm.ean, labels: t }))) return;
    await sendCreatedProductToAllSites({ createForm, site, createImageFiles, translateTexts, autoDetectSourceLanguage, convertCurrency, setCreateAllSitesLoading, setError, setSyncStatus, setSyncLog });
  }
  async function handleSendCreatedProduct() {
    if (!createForm) return setError(t.clickCreateFirst);
    if (!window.confirm(buildXLJVWriteConfirmMessage({ action: "send_created", ean: createForm.ean, labels: t }))) return;
    if (isAllSitesSelected) return handleSendCreatedProductToAllSites();
    await sendCreatedProduct({ createForm, site, siteKey, siteKeyOptions, translateTexts, autoDetectSourceLanguage, convertCurrency, setCreateProductSendLoading, setError, setSyncStatus, setSyncLog, setEan, setItem, setCreateForm });
  }
  async function handleSendToSelectedSites() {
    const precheckError = getSendToSelectedSitesPrecheckError({ ean, hasOrderDraft: Boolean(orderDraft), selectedSiteKeys, templateSiteKey, labels: t });
    if (precheckError) return setError(precheckError);
    if (!orderDraft) return setError(t.createOrderDraftFirst);
    if (!window.confirm(buildXLJVWriteConfirmMessage({ action: "send_selected_sites", ean, labels: t }))) return;
    await sendToSelectedSites({ ean, orderDraft, site, selectedSiteKeys, templateSiteKey, translateTexts, autoDetectSourceLanguage, convertCurrency, setSendSelectedLoading, setBatchLanguageMapsAttempted, setError, setSyncStatus, setSyncLog, setBatchLanguageMaps });
  }
  async function handleSync() {
    if (!window.confirm(buildXLJVWriteConfirmMessage({ action: "sync", ean, labels: t }))) return;
    await syncByEan({ ean, site, siteKey, translateTexts, autoDetectSourceLanguage, convertCurrency, setSyncLoading, setError, setSyncStatus, setSyncLog, onSuccess: (normalizedEan, currentSite, currentSiteKey) => {
      const targetSitesQuery = selectedSiteKeys.length > 0 ? `&target_sites=${encodeURIComponent(selectedSiteKeys.join(","))}` : "";
      router.push(`/xl-jv/edit?ean=${encodeURIComponent(normalizedEan)}&site=${encodeURIComponent(currentSite)}${currentSiteKey.trim() ? `&site_key=${encodeURIComponent(currentSiteKey.trim())}` : ""}${targetSitesQuery}`);
    } });
  }

  async function handleCreateOrderDraft() {
    const eanError = getRequiredEanError(ean, t);
    if (eanError) return setError(eanError);
    if (!templateSiteKey) return setError(t.chooseTemplateSite);
    if (selectedSiteKeys.length === 0) return setError(t.chooseOneTargetSite);
    setCreateOrderLoading(true); setError(null);
    try {
      const { response, payload } = await getProductMutation.mutateAsync({ ean: ean.trim(), site, siteKey: templateSiteKey });
      if (!response.ok) throw new Error(payload.detail || `${t.requestFailed}: HTTP ${response.status}`);
      const firstDescription = (payload.descriptions ?? [])[0] ?? {};
      setOrderDraft({ name: String(firstDescription.name ?? ""), description: String(firstDescription.description ?? ""), tag: String(firstDescription.tag ?? ""), meta_title: String(firstDescription.meta_title ?? ""), meta_description: String(firstDescription.meta_description ?? ""), meta_keyword: String(firstDescription.meta_keyword ?? ""), default_price: String(payload.price ?? "") });
      setSyncStatus(t.orderDraftCreated);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message || t.failedCreateOrderDraft : t.failedCreateOrderDraft); }
    finally { setCreateOrderLoading(false); }
  }
  function handleCreateOrder() {
    const eanError = getRequiredEanError(ean, t);
    if (eanError) return setError(eanError);
    if (!templateSiteKey) return setError("Choose template site.");
    const targetSitesQuery = selectedSiteKeys.length > 0 ? `&target_sites=${encodeURIComponent(selectedSiteKeys.join(","))}` : "";
    router.push(`/xl-jv/edit?ean=${encodeURIComponent(ean.trim())}&site=${encodeURIComponent(site)}&site_key=${encodeURIComponent(templateSiteKey)}${targetSitesQuery}`);
  }

  return {
    t, ean, setEan, site, setSite, siteKey, setSiteKey, loading, syncLoading, allXlLoading, error, syncStatus, syncLog, item, allXlResult,
    selectedSiteKeys, templateSiteKey, createOrderLoading, createProductLoading, createProductSendLoading, createImageUploadLoading, createAllSitesLoading,
    createForm, rubricsLoading, rubrics, selectedRubricIds, mainRubricId, translateTexts, autoDetectSourceLanguage, convertCurrency, deliveryOptions, deliveryOptionsLoading,
    sendSelectedLoading, batchLanguageMaps, batchLanguageMapsAttempted, orderDraft, setOrderDraft, siteKeyOptions,
    setTranslateTexts, setAutoDetectSourceLanguage, setConvertCurrency, setCreateForm, setTemplateSiteKey,
    handleSearch, handleSync, handleSearchAllSites, handleCreateProduct, handleLoadRubrics, handleToggleRubric, handleSetMainRubric,
    handleLoadDeliveryOptions, handleCreateImageUpload, handleSendCreatedProduct, handleSendCreatedProductToAllSites,
    toggleSelectedSite, handleCreateOrder, handleCreateOrderDraft, handleSendToSelectedSites
  };
}
