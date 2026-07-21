"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useLabels } from "../../app/use-labels";
import { Card } from "../shared/card";
import { useToast } from "../shared/toast-provider";
import {
  xljvGetDeliveryOptions,
  xljvGetRubricsTree,
  xljvBatchApplyByEan,
  xljvGetSitesByEan,
  xljvLocalByEan,
  xljvSyncByEan,
  xljvUpdateByEan,
  xljvUploadImages
} from "./xljv-api";
import { XLJVEditForm } from "./xljv-edit-form";
import {
  RubricTreeNode,
  Site,
  SiteLanguageMapPreview,
  XLAllSitesResult,
  XLJVProduct,
  PatchPayload,
  buildDiffPayload,
  buildPatchPayload,
  extractChangedDescriptions
} from "./xljv-edit-utils";

type XLJVEditPanelProps = {
  ean?: string;
  site?: Site;
  siteKey?: string;
  targetSiteKeys?: string[];
};

export function XLJVEditPanel(props: XLJVEditPanelProps = {}) {
  const t = useLabels();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const ean = (props.ean ?? searchParams.get("ean") ?? "").trim();
  const site = (props.site ?? (((searchParams.get("site") || "XL").toUpperCase() === "JV" ? "JV" : "XL") as Site));
  const siteKey = (props.siteKey ?? searchParams.get("site_key") ?? "").trim();
  const targetSitesParam = searchParams.get("target_sites") || "";
  const targetSiteKeysPropKey = (props.targetSiteKeys || []).join(",");
  const preferredTargetSiteKeys = useMemo(
    () => {
      const rawTargetSites = targetSiteKeysPropKey || targetSitesParam;
      return rawTargetSites
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    },
    [targetSiteKeysPropKey, targetSitesParam]
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<XLJVProduct | null>(null);
  const [baselinePayload, setBaselinePayload] = useState<PatchPayload | null>(null);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [batchSending, setBatchSending] = useState(false);
  const [allSitesResult, setAllSitesResult] = useState<XLAllSitesResult | null>(null);
  const [selectedSiteKeys, setSelectedSiteKeys] = useState<string[]>(
    preferredTargetSiteKeys.length > 0 ? preferredTargetSiteKeys : (siteKey ? [siteKey] : [])
  );
  const [templateSiteKey, setTemplateSiteKey] = useState(siteKey);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [batchLanguageMaps, setBatchLanguageMaps] = useState<SiteLanguageMapPreview[]>([]);
  const [batchLanguageMapsAttempted, setBatchLanguageMapsAttempted] = useState(false);
  const [activeSiteKey, setActiveSiteKey] = useState(siteKey);
  const [rubrics, setRubrics] = useState<RubricTreeNode[]>([]);
  const [rubricsLoading, setRubricsLoading] = useState(false);
  const [deliveryOptions, setDeliveryOptions] = useState<Array<{ id: number; label: string; is_default?: boolean }>>([]);
  const [deliveryOptionsLoading, setDeliveryOptionsLoading] = useState(false);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const [pendingBatchMainImage, setPendingBatchMainImage] = useState("");
  const [pendingBatchMainImageBySiteKey, setPendingBatchMainImageBySiteKey] = useState<Record<string, string>>({});
  const lastErrorToastRef = useRef<string>("");
  const lastSuccessToastRef = useRef<string>("");
  const lastBatchStatusToastRef = useRef<string>("");
  const lastBatchErrorsToastRef = useRef<string>("");
  const syncMutation = useMutation({
    mutationFn: xljvSyncByEan
  });
  const localMutation = useMutation({
    mutationFn: xljvLocalByEan
  });
  const sitesMutation = useMutation({
    mutationFn: xljvGetSitesByEan
  });

  const reloadRubrics = useCallback(async () => {
    const effectiveSiteKey = activeSiteKey || siteKey;
    if (!effectiveSiteKey) return;
    try {
      setRubricsLoading(true);
      const rubricsRes = await xljvGetRubricsTree({ site, siteKey: effectiveSiteKey, language: "de" });
      if (rubricsRes.response.ok) setRubrics(Array.isArray(rubricsRes.payload.items) ? rubricsRes.payload.items : []);
    } finally {
      setRubricsLoading(false);
    }
  }, [site, activeSiteKey, siteKey]);

  function normalizeNumberString(value: string | number | undefined): string | number | undefined {
    if (typeof value === "number") {
      return Number.isFinite(value) ? Number(String(value)) : value;
    }
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed)) return value;
    return String(parsed);
  }

  const loadProductBySiteKey = useCallback(async (nextSiteKey: string) => {
    if (!ean) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // Always refresh local draft from source for selected template site.
      const { response: syncResponse, text: syncText } = await syncMutation.mutateAsync({
        ean,
        site,
        siteKey: nextSiteKey,
        requestBody: {},
        batch: false
      });
      let syncPayload: XLJVProduct | { item?: XLJVProduct; detail?: string } = {};
      try {
        syncPayload = JSON.parse(syncText) as XLJVProduct | { item?: XLJVProduct; detail?: string };
      } catch {
        syncPayload = {};
      }
      if (!syncResponse.ok) {
        const detail = "detail" in syncPayload ? syncPayload.detail : undefined;
        throw new Error(detail || `${t.syncFailed}: HTTP ${syncResponse.status}`);
      }

      const { response, payload } = await localMutation.mutateAsync({
        ean,
        site,
        siteKey: nextSiteKey
      });
      if (!response.ok) {
        throw new Error(payload.detail || `${t.requestFailed}: HTTP ${response.status}`);
      }

      const nextForm = {
        ...payload,
        price: normalizeNumberString(payload.price),
        image: payload.image || "",
        images: Array.isArray(payload.images) ? payload.images : [],
        jv_fields: payload.jv_fields
      };
      setForm(nextForm);
      setBaselinePayload(buildPatchPayload(nextForm));
      setPendingBatchMainImage("");
      setPendingBatchMainImageBySiteKey({});
      setActiveSiteKey(nextSiteKey);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "";
      setError(message || t.failedLoadLocalProduct);
    } finally {
      setLoading(false);
    }
  // `mutateAsync` from react-query mutation objects is stable enough for this callback,
  // while adding full mutation objects to deps may cause render loops here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ean, site, t.failedLoadLocalProduct, t.requestFailed, t.syncFailed]);

  useEffect(() => {
    if (!ean) return;
    async function load() {
      await loadProductBySiteKey(activeSiteKey);
    }
    void load();
  }, [ean, activeSiteKey, loadProductBySiteKey]);

  useEffect(() => {
    const setSelectedSiteKeysIfChanged = (next: string[]) => {
      setSelectedSiteKeys((current) => {
        if (current.length === next.length && current.every((value, index) => value === next[index])) {
          return current;
        }
        return next;
      });
    };

    if (preferredTargetSiteKeys.length > 0) {
      setSelectedSiteKeysIfChanged(preferredTargetSiteKeys);
      return;
    }
    if (siteKey) {
      setSelectedSiteKeysIfChanged([siteKey]);
    }
  }, [preferredTargetSiteKeys, siteKey]);

  useEffect(() => {
    async function loadMeta() {
      await reloadRubrics();
      if (site !== "JV") return;
      const effectiveSiteKey = activeSiteKey || siteKey;
      if (!effectiveSiteKey) return;
      try {
        setDeliveryOptionsLoading(true);
        const deliveryRes = await xljvGetDeliveryOptions({ site: "JV", siteKey: effectiveSiteKey, language: "de" });
        if (deliveryRes.response.ok) setDeliveryOptions(Array.isArray(deliveryRes.payload.items) ? deliveryRes.payload.items : []);
      } finally {
        setDeliveryOptionsLoading(false);
      }
    }
    void loadMeta();
  }, [site, activeSiteKey, siteKey, reloadRubrics]);

  async function handleLoadAllSites() {
    if (!ean) return;
    setSitesLoading(true);
    setBatchStatus(null);
    try {
      const { response, payload } = await sitesMutation.mutateAsync({ ean, site });
      if (!response.ok) {
        throw new Error(payload.detail || `${t.requestFailed}: HTTP ${response.status}`);
      }
      setAllSitesResult(payload);
      const foundKeys = (payload.found || []).map((row) => row.site_key);
      if (preferredTargetSiteKeys.length > 0) {
        const picked = foundKeys.filter((key) => preferredTargetSiteKeys.includes(key));
        setSelectedSiteKeys(picked);
      } else {
        setSelectedSiteKeys(foundKeys);
      }
      const nextTemplate = siteKey || foundKeys[0] || "";
      setTemplateSiteKey(nextTemplate);
      if (nextTemplate) {
        await loadProductBySiteKey(nextTemplate);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "";
      setError(message || t.failedLoadTargetSites);
    } finally {
      setSitesLoading(false);
    }
  }

  function toggleSelectedSite(siteKeyValue: string) {
    setSelectedSiteKeys((current) => {
      const next = current.includes(siteKeyValue)
        ? current.filter((value) => value !== siteKeyValue)
        : [...current, siteKeyValue];
      return next;
    });
  }

  useEffect(() => {
    if (selectedSiteKeys.length > 0 && error === t.chooseOneTargetSite) {
      setError(null);
    }
  }, [selectedSiteKeys, error, t.chooseOneTargetSite]);

  useEffect(() => {
    if (!error) return;
    if (lastErrorToastRef.current === error) return;
    lastErrorToastRef.current = error;
    showToast(error, "error");
  }, [error, showToast]);

  useEffect(() => {
    if (!success) return;
    if (lastSuccessToastRef.current === success) return;
    lastSuccessToastRef.current = success;
    showToast(success, "success");
  }, [success, showToast]);

  useEffect(() => {
    if (!batchStatus) return;
    if (lastBatchStatusToastRef.current === batchStatus) return;
    lastBatchStatusToastRef.current = batchStatus;
    showToast(batchStatus, "info");
  }, [batchStatus, showToast]);

  useEffect(() => {
    if (batchErrors.length === 0) return;
    const message = batchErrors.join(" | ");
    if (lastBatchErrorsToastRef.current === message) return;
    lastBatchErrorsToastRef.current = message;
    showToast(message, "error");
  }, [batchErrors, showToast]);

  function toggleRubric(id: number) {
    setForm((current) => {
      if (!current) return current;
      const rows = [...(current.categories || [])];
      const idx = rows.findIndex((x) => Number(x.category_id) === id);
      if (idx >= 0) {
        const next = rows.filter((x) => Number(x.category_id) !== id);
        if (next.length > 0 && !next.some((x) => Boolean(x.main_category))) next[0].main_category = true;
        return { ...current, categories: next };
      }
      const next = [...rows, { category_id: id, main_category: rows.length === 0 }];
      return { ...current, categories: next };
    });
  }

  function setMainRubric(id: number) {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        categories: (current.categories || []).map((x) => ({
          category_id: x.category_id,
          main_category: Number(x.category_id) === id
        }))
      };
    });
  }

  async function handleSendToSelectedSites() {
    if (!form) return;
    const effectiveTargetSiteKeys = selectedSiteKeys.length > 0 ? selectedSiteKeys : preferredTargetSiteKeys;
    if (!ean) {
      setError(t.eanMissing);
      return;
    }
    if (effectiveTargetSiteKeys.length === 0) {
      setError(t.chooseOneTargetSite);
      return;
    }
    if (!templateSiteKey) {
      setError(t.chooseTemplateSite);
      return;
    }

    setBatchSending(true);
    setBatchLanguageMapsAttempted(true);
    setBatchStatus(null);
    setBatchErrors([]);
    setBatchLanguageMaps([]);
    setError(null);
    setSuccess(null);
    try {
      const fullPayload = buildPatchPayload(form);
      const changed = buildDiffPayload(fullPayload, baselinePayload);
      const changedWithoutUpdateUser = { ...changed };
      delete changedWithoutUpdateUser.update_user;
      if (site === "XL") {
        delete changedWithoutUpdateUser.jv_fields;
      }
      const currentMainImage = String(form.image || "").trim();
      if (
        pendingBatchMainImage &&
        currentMainImage &&
        currentMainImage === pendingBatchMainImage &&
        changedWithoutUpdateUser.image === undefined
      ) {
        changedWithoutUpdateUser.image = currentMainImage;
      }
      if (Object.keys(pendingBatchMainImageBySiteKey).length > 0) {
        changedWithoutUpdateUser.image_by_site_key = pendingBatchMainImageBySiteKey;
      }
      if ("descriptions" in changedWithoutUpdateUser) {
        const changedDescriptions = extractChangedDescriptions(fullPayload, baselinePayload);
        if (changedDescriptions.length > 0) {
          changedWithoutUpdateUser.descriptions = changedDescriptions;
        } else {
          delete changedWithoutUpdateUser.descriptions;
        }
      }
      if (Object.keys(changedWithoutUpdateUser).length === 0) {
        setBatchStatus(t.noChangedFieldsToSend);
        setBatchSending(false);
        return;
      }

      const hasNonTemplateTargetSite = effectiveTargetSiteKeys.some((key) => key !== templateSiteKey);
      const shouldTranslateTexts =
        (site === "JV" && hasNonTemplateTargetSite) ||
        "descriptions" in changedWithoutUpdateUser ||
        "jv_fields" in changedWithoutUpdateUser;
      const deContent =
        (form.jv_fields?.content_by_language || []).find((row) => (row?.language_code || "de") === "de") || {};
      const firstDescription = (form.descriptions || [])[0] || {};
      const translationSource = {
        name: String(deContent.name || firstDescription.name || ""),
        description: String(deContent.description || firstDescription.description || ""),
        tag: String(firstDescription.tag || ""),
        meta_title: String(deContent.meta_title || firstDescription.meta_title || ""),
        meta_description: String(deContent.meta_description || firstDescription.meta_description || ""),
        meta_keyword: String(deContent.meta_keyword || firstDescription.meta_keyword || "")
      };

      const requestBody = {
        template_main_category_id:
          (form.categories || []).find((c) => c.main_category)?.category_id ??
          (form.categories || [])[0]?.category_id ??
          null,
        site_family: site,
        site_keys: effectiveTargetSiteKeys,
        template_site_key: templateSiteKey,
        translate_texts: shouldTranslateTexts,
        ...(shouldTranslateTexts
          ? {
              translation_source: translationSource,
              translation_source_language: "auto"
            }
          : {}),
        ...changedWithoutUpdateUser
      };
      const { response, payload } = await xljvBatchApplyByEan({
        ean,
        site,
        requestBody
      });
      const parsed = payload as {
        detail?: string;
        summary?: { applied?: number; failed?: number; skipped?: number };
        language_mapping_by_site?: Array<{
          site_key?: string;
          domain?: string;
          target_locale?: string;
          language_id_by_locale?: Record<string, number>;
        }>;
        job?: {
          items?: Array<{
            site_key?: string;
            domain?: string;
            status?: string;
            error_code?: string;
            error_text?: string;
            details?: {
              target_locale?: string;
              language_id_by_locale?: Record<string, number>;
            };
          }>;
        };
      };
      if (!response.ok) {
        throw new Error(parsed.detail || `${t.batchFailed}: HTTP ${response.status}`);
      }
      setPendingBatchMainImage("");
      setPendingBatchMainImageBySiteKey({});
      const s = parsed.summary || {};
      setBatchStatus(`${t.done}. ${t.applied}: ${s.applied ?? 0}, ${t.failed}: ${s.failed ?? 0}, ${t.skipped}: ${s.skipped ?? 0}`);
      const failedItems = (parsed.job?.items || []).filter((item) => item.status === "failed");
      if (failedItems.length > 0) {
        setBatchErrors(
          failedItems.map((item) => {
            const siteLabel = item.site_key || item.domain || t.site.toLowerCase();
            const reason = item.error_text || item.error_code || t.unknownError;
            return `${siteLabel}: ${reason}`;
          })
        );
      }
      const languageMapRows: SiteLanguageMapPreview[] = (parsed.job?.items || [])
        .map((item) => {
          const map = item.details?.language_id_by_locale || {};
          const altMap = (item.details as { language_map_by_locale?: Record<string, number> } | undefined)?.language_map_by_locale || {};
          const mergedMap = { ...altMap, ...map };
          const normalizedMap: Record<string, number> = {};
          Object.entries(mergedMap).forEach(([locale, languageId]) => {
            if (!locale) return;
            const parsed = Number(languageId);
            if (!Number.isFinite(parsed)) return;
            normalizedMap[locale] = parsed;
          });
          return {
            siteKey: item.site_key || "",
            domain: item.domain || "",
            targetLocale: item.details?.target_locale || "",
            languageIdByLocale: normalizedMap
          };
        })
        .filter((row) => Object.keys(row.languageIdByLocale).length > 0)
        .sort((a, b) => (a.siteKey || a.domain).localeCompare(b.siteKey || b.domain));
      const fallbackRows: SiteLanguageMapPreview[] = (parsed.language_mapping_by_site || [])
        .map((row) => ({
          siteKey: String(row.site_key || ""),
          domain: String(row.domain || ""),
          targetLocale: String(row.target_locale || ""),
          languageIdByLocale: Object.fromEntries(
            Object.entries(row.language_id_by_locale || {})
              .map(([locale, languageId]) => [locale, Number(languageId)])
              .filter(([, languageId]) => Number.isFinite(languageId))
          ) as Record<string, number>
        }))
        .filter((row) => Object.keys(row.languageIdByLocale).length > 0)
        .sort((a, b) => (a.siteKey || a.domain).localeCompare(b.siteKey || b.domain));
      setBatchLanguageMaps(languageMapRows.length > 0 ? languageMapRows : fallbackRows);
      if (response.status === 202) {
        setSuccess(t.xljvUpdateAcceptedQueued);
      } else {
        setSuccess(t.sentToSelectedSites);
      }
      if ((s.failed ?? 0) > 0) {
        showToast(
          t.xljvUpdateCompletedWithErrors
            .replace("{applied}", String(s.applied ?? 0))
            .replace("{failed}", String(s.failed ?? 0))
            .replace("{skipped}", String(s.skipped ?? 0)),
          "error"
        );
      } else if ((s.applied ?? 0) > 0) {
        showToast(
          t.xljvChangesAppliedSummary
            .replace("{applied}", String(s.applied ?? 0))
            .replace("{skipped}", String(s.skipped ?? 0)),
          "success"
        );
      } else {
        showToast(
          t.xljvNoSitesUpdatedSummary
            .replace("{applied}", String(s.applied ?? 0))
            .replace("{failed}", String(s.failed ?? 0))
            .replace("{skipped}", String(s.skipped ?? 0)),
          "info"
        );
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "";
      setError(message || t.failedSendToSelectedSites);
    } finally {
      setBatchSending(false);
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!form || !ean) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const fullPayload = buildPatchPayload(form);
      const payload = buildDiffPayload(fullPayload, baselinePayload);
      if (site === "XL") {
        delete payload.jv_fields;
      }
      if (Object.keys(payload).length === 0) {
        setSuccess(t.noChangesToSave);
        setSaving(false);
        return;
      }

      const { response, payload: result } = await xljvUpdateByEan({
        ean,
        site,
        siteKey: activeSiteKey,
        payload
      });
      if (!response.ok) {
        const parts = [result.detail || `${t.patchFailed}: HTTP ${response.status}`];
        if (result.error) {
          parts.push(`${t.sourceError}: ${result.error}`);
        }
        throw new Error(parts.join("\n"));
      }
      setBaselinePayload(fullPayload);
      setSuccess(t.saved);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "";
      setError(message || t.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadImages(files: FileList | null, imageRole: "main" | "additional" = "main") {
    if (!files || files.length === 0 || !form) return;
    const effectiveSiteKey = (activeSiteKey || siteKey || "").trim();
    if (!effectiveSiteKey) {
      setError(t.xljvSiteKeyRequiredForImageUpload);
      return;
    }
    setImageUploadLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const fileArray = Array.from(files);
      const targetSiteKeys = imageRole === "main"
        ? Array.from(new Set([effectiveSiteKey, ...(selectedSiteKeys.length > 0 ? selectedSiteKeys : preferredTargetSiteKeys)].map((value) => value.trim()).filter(Boolean)))
        : [effectiveSiteKey];
      const uploadedBySiteKey: Record<string, string[]> = {};
      const uploadedPublicBySiteKey: Record<string, string[]> = {};
      const uploadErrors: string[] = [];
      for (const targetSiteKey of targetSiteKeys) {
        const { response, payload } = await xljvUploadImages({
          site,
          siteKey: targetSiteKey,
          ean,
          files: fileArray,
          imageRole
        });
        if (!response.ok) {
          uploadErrors.push(`${targetSiteKey}: ${String((payload as { detail?: string }).detail || `HTTP ${response.status}`)}`);
          continue;
        }
        const targetUrls = Array.isArray(payload.uploaded_image_urls)
          ? payload.uploaded_image_urls.map((v: unknown) => String(v || "").trim()).filter(Boolean)
          : [];
        if (targetUrls.length === 0) {
          uploadErrors.push(`${targetSiteKey}: ${t.uploadNoImageUrls}`);
          continue;
        }
        const targetPublicUrls = Array.isArray(payload.uploaded_image_public_urls)
          ? payload.uploaded_image_public_urls.map((v: unknown) => String(v || "").trim()).filter(Boolean)
          : [];
        uploadedBySiteKey[targetSiteKey] = targetUrls;
        uploadedPublicBySiteKey[targetSiteKey] = targetPublicUrls;
      }
      const urls = uploadedBySiteKey[effectiveSiteKey] || Object.values(uploadedBySiteKey)[0] || [];
      const publicUrls = uploadedPublicBySiteKey[effectiveSiteKey] || Object.values(uploadedPublicBySiteKey)[0] || [];
      if (urls.length === 0) {
        throw new Error(uploadErrors[0] || t.uploadNoImageUrls);
      }
      setForm((current) => {
        if (!current) return current;
        const existing = Array.isArray(current.images) ? [...current.images] : [];
        const existingPublic = Array.isArray(current.images_public_urls) ? [...current.images_public_urls] : [];
        const seen = new Set(existing.map((x) => String(x.image || "").trim()).filter(Boolean));
        const seenPublic = new Set(existingPublic.map((x) => String(x.public_url || x.image || "").trim()).filter(Boolean));
        const extra = imageRole === "additional" ? urls : urls.slice(1);
        const extraPublic = imageRole === "additional" ? publicUrls : publicUrls.slice(1);
        for (const [idx, url] of extra.entries()) {
          if (!seen.has(url)) {
            existing.push({ image: url, sort_order: existing.length });
            seen.add(url);
          }
          const publicUrl = extraPublic[idx] || "";
          if (publicUrl && !seenPublic.has(publicUrl)) {
            existingPublic.push({ image: url, public_url: publicUrl, sort_order: existingPublic.length });
            seenPublic.add(publicUrl);
          }
        }
        return {
          ...current,
          image: imageRole === "additional" ? current.image : urls[0],
          image_public_url: imageRole === "additional" ? current.image_public_url : (publicUrls[0] || current.image_public_url),
          images: existing,
          images_public_urls: existingPublic
        };
      });
      if (imageRole === "main") {
        const mainBySiteKey = Object.fromEntries(
          Object.entries(uploadedBySiteKey)
            .map(([key, value]) => [key, value[0] || ""])
            .filter(([, value]) => Boolean(value))
        );
        setPendingBatchMainImage(urls[0]);
        setPendingBatchMainImageBySiteKey(mainBySiteKey);
      }
      setSuccess(
        imageRole === "additional"
          ? t.xljvUploadedAdditionalImagesToFtp.replace("{count}", String(urls.length))
          : t.xljvUploadedMainImageToSites
              .replace("{count}", String(Object.keys(uploadedBySiteKey).length))
              .replace(
                "{errors}",
                uploadErrors.length > 0 ? ` ${t.xljvUploadPartialErrors.replace("{errors}", uploadErrors.join(" | "))}` : ""
              )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message || t.failedUploadImageFiles);
    } finally {
      setImageUploadLoading(false);
    }
  }

  if (!ean) {
    return <Card className="text-sm text-red-600">{t.eanMissingInUrl}</Card>;
  }

  if (loading) {
    return <Card className="text-sm">{t.loading}</Card>;
  }

  if (!form) {
    return <Card className="text-sm text-red-600">{error || t.noData}</Card>;
  }


  return (
      <XLJVEditForm
      ean={ean}
      site={site}
      siteKey={activeSiteKey || siteKey}
      form={form}
      saving={saving}
      sitesLoading={sitesLoading}
      batchSending={batchSending}
      batchStatus={batchStatus}
      batchErrors={batchErrors}
      batchLanguageMapsAttempted={batchLanguageMapsAttempted}
      batchLanguageMaps={batchLanguageMaps}
      allSitesResult={allSitesResult}
      selectedSiteKeys={selectedSiteKeys}
      templateSiteKey={templateSiteKey}
      setTemplateSiteKey={setTemplateSiteKey}
      setForm={setForm}
        onToggleSelectedSite={toggleSelectedSite}
        onLoadProductBySiteKey={loadProductBySiteKey}
        onHandleSave={handleSave}
        onHandleLoadAllSites={handleLoadAllSites}
        onHandleSendToSelectedSites={handleSendToSelectedSites}
        rubrics={rubrics}
        rubricsLoading={rubricsLoading}
        onReloadRubrics={reloadRubrics}
        onToggleRubric={toggleRubric}
        onSetMainRubric={setMainRubric}
        deliveryOptions={deliveryOptions}
        deliveryOptionsLoading={deliveryOptionsLoading}
        imageUploadLoading={imageUploadLoading}
        onUploadImages={handleUploadImages}
      />
  );
}
