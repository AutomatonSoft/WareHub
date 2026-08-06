"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLabels } from "../../app/use-labels";
import { ProductEditorPanelLayout } from "./product-editor-shared-panels";
import { buildJvChangedFields } from "./product-editor-model";
import {
  getJvDeliveryOptions,
  getJvRubricTree,
  getXlRubricTree,
  type ProductEditorJvDeliveryOption,
  type ProductEditorJvRubricNode
} from "./product-editor-api";
import { Button } from "../ui/button";
import { FormField } from "../ui/form-field";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { StatusBadge } from "../ui/status-badge";
import { cn } from "../../lib/cn";
import { CreateProductImageGallery, JvCreateProductPanel, JvPublishingOptionsPanel, type JvPublishingSelections } from "../product-forms";
import type {
  ProductEditorJobResponse,
  ProductEditorJvCategory,
  ProductEditorJvDraft,
  ProductEditorJvFieldsBySiteKey,
  ProductEditorJvSiteKey,
  ProductEditorWarning
} from "./product-editor-types";

const JV_SITE_TABS: ReadonlyArray<{ key: ProductEditorJvSiteKey; label: string }> = [
  { key: "JV_DE", label: "JV DE" },
  { key: "JV_AT", label: "JV AT" },
  { key: "JV_CH", label: "JV CH" },
  { key: "JV_CO_UK", label: "JV UK" }
] as const;
const XL_SITE_TABS: ReadonlyArray<{ key: ProductEditorJvSiteKey; label: string }> = [
  { key: "XLMOEBEL_DE", label: "XL DE" }
] as const;
type JvPublishingSiteKey = "JV_DE" | "JV_AT" | "JV_CH" | "JV_CO_UK";
const ALL_STRUCTURED_SITE_TABS: ReadonlyArray<{ key: ProductEditorJvSiteKey; label: string }> = [...JV_SITE_TABS, ...XL_SITE_TABS];
let cachedDeliveryOptionsBySite: Partial<Record<ProductEditorJvSiteKey, ProductEditorJvDeliveryOption[]>> = {};
let deliveryOptionsPromiseBySite: Partial<Record<ProductEditorJvSiteKey, Promise<ProductEditorJvDeliveryOption[]>>> = {};
let cachedRubricTreeBySite: Partial<Record<ProductEditorJvSiteKey, ProductEditorJvRubricNode[]>> = {};
let rubricTreePromiseBySite: Partial<Record<ProductEditorJvSiteKey, Promise<ProductEditorJvRubricNode[]>>> = {};

type ProductEditorJvPanelProps = {
  groupId: "JV" | "XL";
  draft: ProductEditorJvDraft;
  initialDraft: ProductEditorJvDraft;
  loading: boolean;
  warnings: ProductEditorWarning[];
  onChange: (patch: Partial<ProductEditorJvDraft>) => void;
  activeTabLabel?: string;
  batchApplyLoading?: boolean;
  jobResponse?: ProductEditorJobResponse | null;
  onApplyEditedProducts?: () => void;
  eanValue: string;
  isEanValid: boolean;
  searching: boolean;
  onChangeEan: (value: string) => void;
  onSearch: () => void;
};

export function ProductEditorJvPanel(props: ProductEditorJvPanelProps) {
  const t = useLabels();
  const isXlMode = props.groupId === "XL";
  const siteTabs = isXlMode ? XL_SITE_TABS : JV_SITE_TABS;
  const baselineSiteKey = resolveJvBaselineSiteKey(props.draft);
  const changedFields = buildJvChangedFields(props.initialDraft, props.draft);
  const galleryState = buildJvGalleryState(props.draft);
  const mainImageUrl = galleryState.mainImage.preview;
  const additionalImageUrls = galleryState.additionalImages.map((item) => item.preview);
  const jvContentDe = getJvContentByLanguage(props.draft.jv_fields, "de");
  const productName = String(jvContentDe?.name ?? "");
  const metaTitleValue = String(jvContentDe?.meta_title ?? "");
  const metaDescriptionValue = String(jvContentDe?.meta_description ?? "");
  const metaKeywordValue = String(jvContentDe?.meta_keyword ?? "");
  const metaKeywordLineCount = countNonEmptyLines(metaKeywordValue);
  const bezeichnungValue = String(jvContentDe?.bezeichnung ?? jvContentDe?.short_description ?? "");
  const kurzbeschreibungValue = String(jvContentDe?.kurzbeschreibung ?? jvContentDe?.short_description_real ?? "");
  const descriptionValue = String(jvContentDe?.description ?? "");
  const descriptionPreviewHtml = normalizeDescriptionHtmlForPreview(descriptionValue);
  const urlKeyValue = props.draft.jv_fields?.urlkey ?? "";
  const priceValue = props.draft.price ?? "";
  const uvpValue = props.draft.jv_fields?.uvp ?? "";
  const isSofortDisabled = Number(props.draft.jv_fields?.is_sofort ?? 0) === 0;
  const isInactiveDisabled = Number(props.draft.jv_fields?.inaktiv ?? 1) === 1;
  const isSofortEnabled = !isSofortDisabled;
  const isInactiveEnabled = !isInactiveDisabled;
  const galleryImages = galleryState.allImages;
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(mainImageUrl || additionalImageUrls[0] || "");
  const [descriptionMode, setDescriptionMode] = useState<"code" | "preview">("preview");
  const [activeSiteKey, setActiveSiteKey] = useState<ProductEditorJvSiteKey>(baselineSiteKey);
  const [deliveryOptionsBySite, setDeliveryOptionsBySite] = useState<Partial<Record<ProductEditorJvSiteKey, ProductEditorJvDeliveryOption[]>>>({});
  const [categoryTreeBySite, setCategoryTreeBySite] = useState<Partial<Record<ProductEditorJvSiteKey, ProductEditorJvRubricNode[]>>>({});
  const [expandedCategoryIdsBySite, setExpandedCategoryIdsBySite] = useState<Partial<Record<ProductEditorJvSiteKey, Set<number>>>>({});
  const [categoryQuery, setCategoryQuery] = useState("");
  const [onlyCheckedCategories, setOnlyCheckedCategories] = useState(false);
  const displayImageUrl = selectedImageUrl || mainImageUrl || additionalImageUrls[0] || "";
  const createdObjectUrlsRef = useRef<string[]>([]);
  const latestDraftRef = useRef(props.draft);
  const galleryItems = galleryImages.map((item, index) => ({
    id: buildGalleryItemId(item.preview, index),
    src: item.preview,
    uploading: false
  }));
  const selectedGalleryItemId = galleryItems.find((item) => item.src === displayImageUrl)?.id ?? galleryItems[0]?.id ?? "";

  useEffect(() => {
    latestDraftRef.current = props.draft;
  }, [props.draft]);

  useEffect(() => {
    setActiveSiteKey(baselineSiteKey);
  }, [baselineSiteKey]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const entries = await Promise.all(
        siteTabs.map(async ({ key }) => {
          try {
            return [key, isXlMode ? [] : await loadCachedJvDeliveryOptions(key)] as const;
          } catch {
            return [key, []] as const;
          }
        })
      );
      if (mounted) {
        setDeliveryOptionsBySite(Object.fromEntries(entries) as Partial<Record<ProductEditorJvSiteKey, ProductEditorJvDeliveryOption[]>>);
      }
    })().catch(() => {
      if (mounted) setDeliveryOptionsBySite({});
    });
    return () => {
      mounted = false;
    };
  }, [isXlMode, siteTabs]);

  useEffect(() => {
    return () => {
      for (const url of createdObjectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      createdObjectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const entries = await Promise.all(
        siteTabs.map(async ({ key }) => {
          try {
            const tree = isXlMode ? await loadCachedXlRubricTree(key) : await loadCachedJvRubricTree(key);
            return [key, tree, collectAllCategoryIds(tree)] as const;
          } catch {
            return [key, [], new Set<number>()] as const;
          }
        })
      );
      if (mounted) {
        setCategoryTreeBySite(
          Object.fromEntries(entries.map(([key, tree]) => [key, tree])) as Partial<Record<ProductEditorJvSiteKey, ProductEditorJvRubricNode[]>>
        );
        setExpandedCategoryIdsBySite(
          Object.fromEntries(entries.map(([key, _tree, expanded]) => [key, expanded])) as Partial<Record<ProductEditorJvSiteKey, Set<number>>>
        );
      }
    })().catch(() => {
      if (mounted) {
        setCategoryTreeBySite({});
        setExpandedCategoryIdsBySite({});
      }
    });
    return () => {
      mounted = false;
    };
  }, [isXlMode, siteTabs]);

  const categoriesBySiteKey = getDraftCategoriesBySiteKey(props.draft, baselineSiteKey);
  const currentCategories = categoriesBySiteKey[activeSiteKey] ?? [];
  const selectedCategoryIds = new Set(currentCategories.map((item) => item.category_id));
  const mainCategoryId = currentCategories.find((item) => item.main_category)?.category_id ?? null;
  const categoryTree = categoryTreeBySite[activeSiteKey] ?? [];
  const expandedCategoryIds = expandedCategoryIdsBySite[activeSiteKey] ?? new Set<number>();
  const filteredCategoryTree = filterCategoryTree(categoryTree, categoryQuery, selectedCategoryIds, onlyCheckedCategories);
  const deliveryOptions = deliveryOptionsBySite[activeSiteKey] ?? [];
  const deliveryValuesBySiteKey = getDraftDeliveryValuesBySiteKey(props.draft, baselineSiteKey);
  const publishingSelections = useMemo<JvPublishingSelections>(() => ({
    rubricIdsBySite: Object.fromEntries(JV_SITE_TABS.map(({ key }) => [key, (categoriesBySiteKey[key] ?? []).map((item) => item.category_id)])),
    mainRubricIdBySite: Object.fromEntries(JV_SITE_TABS.map(({ key }) => [key, (categoriesBySiteKey[key] ?? []).find((item) => item.main_category)?.category_id ?? null])),
    deliveryIdsBySite: Object.fromEntries(JV_SITE_TABS.map(({ key }) => {
      const deliveryId = Number(deliveryValuesBySiteKey[key] ?? "");
      return [key, Number.isFinite(deliveryId) && deliveryId > 0 ? [deliveryId] : []];
    })),
  }), [categoriesBySiteKey, deliveryValuesBySiteKey]);
  const publishingSelectionKey = useMemo(() => JSON.stringify(publishingSelections), [publishingSelections]);
  const deliveryIdValue = normalizeDeliverySelectValue(deliveryValuesBySiteKey[activeSiteKey] ?? "", deliveryOptions);
  const jobStatus = String(props.jobResponse?.status || "").toLowerCase();
  const jobSummary = props.jobResponse?.summary ?? {};
  const progressPhase = String(jobSummary.progress_phase || jobStatus || "").trim();
  const progressMessage = String(jobSummary.progress_message || "").trim();
  const progressTotal = toNumber(jobSummary.total);
  const progressApplied = toNumber(jobSummary.applied ?? jobSummary.success);
  const progressSkipped = toNumber(jobSummary.skipped);
  const progressFailed = toNumber(jobSummary.failed);
  const progressCompleted = Math.min(
    progressTotal || progressApplied + progressSkipped + progressFailed,
    progressApplied + progressSkipped + progressFailed
  );
  const isInlineProgressVisible = Boolean(props.batchApplyLoading) || jobStatus === "queued" || jobStatus === "running" || Boolean(progressPhase) || progressTotal > 0;
  const pendingUploadCount = props.draft.pending_uploads.length;

  function patchPrimaryName(name: string) {
    const nextJvFields = setJvContentByLanguage(props.draft.jv_fields, "de", { name });
    props.onChange({
      jv_fields: {
        ...nextJvFields,
        urlkey: buildUrlKeyFromName(name)
      }
    });
  }

  function patchPrimaryMetaTitle(metaTitle: string) {
    const nextJvFields = setJvContentByLanguage(props.draft.jv_fields, "de", { meta_title: metaTitle });
    props.onChange({ jv_fields: nextJvFields });
  }

  function patchPrimaryMetaDescription(metaDescription: string) {
    const nextJvFields = setJvContentByLanguage(props.draft.jv_fields, "de", { meta_description: metaDescription });
    props.onChange({ jv_fields: nextJvFields });
  }

  function patchPrimaryMetaKeyword(metaKeyword: string) {
    const nextJvFields = setJvContentByLanguage(props.draft.jv_fields, "de", { meta_keyword: metaKeyword });
    props.onChange({ jv_fields: nextJvFields });
  }

  function patchPrimaryDescription(description: string) {
    const nextJvFields = setJvContentByLanguage(props.draft.jv_fields, "de", { description });
    props.onChange({ jv_fields: nextJvFields });
  }

  function patchPrice(priceRaw: string) {
    const parsedPrice = parsePriceValue(priceRaw);
    const nextUvp = parsedPrice === null ? String(uvpValue) : String(calculateUvpRoundedTo9(parsedPrice));
    props.onChange({
      price: priceRaw,
      jv_fields: {
        ...(props.draft.jv_fields ?? {}),
        uvp: nextUvp
      }
    });
  }

  function patchIsSofortEnabled(enabled: boolean) {
    props.onChange({
      jv_fields: {
        ...(props.draft.jv_fields ?? {}),
        is_sofort: enabled ? 1 : 0
      }
    });
  }

  function patchInaktivEnabled(enabled: boolean) {
    props.onChange({
      jv_fields: {
        ...(props.draft.jv_fields ?? {}),
        inaktiv: enabled ? 0 : 1
      }
    });
  }

  function patchDeliveryId(value: string) {
    const normalizedValue = normalizeDeliverySelectValue(value, deliveryOptions) || value;
    const nextFieldsBySiteKey: ProductEditorJvFieldsBySiteKey = {
      ...props.draft.jv_fields_by_site_key,
      [activeSiteKey]: {
        ...(props.draft.jv_fields_by_site_key[activeSiteKey] ?? {}),
        lieferzeitid: normalizedValue,
        lieferzeit: normalizedValue,
        lieferzeit_id: normalizedValue
      }
    };
    props.onChange({
      jv_fields_by_site_key: nextFieldsBySiteKey,
      jv_fields:
        activeSiteKey === baselineSiteKey
          ? {
              ...(props.draft.jv_fields ?? {}),
              lieferzeitid: normalizedValue,
              lieferzeit: normalizedValue,
              lieferzeit_id: normalizedValue
            }
          : props.draft.jv_fields
    });
  }

  function patchBezeichnung(value: string) {
    const nextJvFields = setJvContentByLanguage(props.draft.jv_fields, "de", {
      bezeichnung: value,
      short_description: value
    });
    props.onChange({
      jv_fields: nextJvFields
    });
  }

  function patchKurzbeschreibung(value: string) {
    const nextJvFields = setJvContentByLanguage(props.draft.jv_fields, "de", {
      kurzbeschreibung: value,
      short_description_real: value
    });
    props.onChange({
      jv_fields: nextJvFields
    });
  }

  function addCategory(categoryId: number) {
    if (selectedCategoryIds.has(categoryId)) return;
    patchCategoriesForSite(activeSiteKey, [...currentCategories, { category_id: categoryId, main_category: currentCategories.length === 0 }]);
  }

  function removeCategory(categoryId: number) {
    const next = currentCategories.filter((item) => item.category_id !== categoryId);
    const hasMain = next.some((item) => item.main_category);
    patchCategoriesForSite(activeSiteKey, hasMain ? next : next.map((item, index) => ({ ...item, main_category: index === 0 })));
  }

  function toggleCategory(categoryId: number, checked: boolean) {
    if (checked) {
      addCategory(categoryId);
      return;
    }
    removeCategory(categoryId);
  }

  function createObjectUrl(file: File): string {
    const url = URL.createObjectURL(file);
    createdObjectUrlsRef.current.push(url);
    return url;
  }

  function revokeTrackedObjectUrl(url: string) {
    const normalized = String(url || "").trim();
    if (!normalized.startsWith("blob:")) return;
    URL.revokeObjectURL(normalized);
    createdObjectUrlsRef.current = createdObjectUrlsRef.current.filter((entry) => entry !== normalized);
  }

  function handleUploadImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const draft = latestDraftRef.current;
    const currentGalleryState = buildJvGalleryState(draft);
    const galleryWasEmpty = currentGalleryState.allImages.length === 0;
    const additionalFiles = galleryWasEmpty ? fileList.slice(1) : fileList;
    const mainTempUrl = galleryWasEmpty && fileList[0] ? createObjectUrl(fileList[0]) : "";
    const nextImages = [...draft.images];
    const nextPendingUploads = [...draft.pending_uploads];

    for (const file of additionalFiles) {
      const tempUrl = createObjectUrl(file);
      nextImages.push({
        image: tempUrl,
        public_url: tempUrl,
        sort_order: nextImages.length
      });
      nextPendingUploads.push(buildPendingUploadEntry(file, tempUrl, nextPendingUploads.length));
    }

    if (mainTempUrl && fileList[0]) {
      nextPendingUploads.push(buildPendingUploadEntry(fileList[0], mainTempUrl, nextPendingUploads.length));
    }

    props.onChange({
      image: mainTempUrl || draft.image,
      image_public_url: mainTempUrl || draft.image_public_url,
      images: nextImages,
      pending_uploads: dedupePendingUploads(nextPendingUploads)
    });

    if (mainTempUrl) {
      setSelectedImageUrl(mainTempUrl);
    }
  }

  function moveGalleryImage(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const items = [...galleryImages];
    const [moved] = items.splice(fromIndex, 1);
    if (!moved) return;
    items.splice(toIndex, 0, moved);

    const [nextMain, ...nextAdditional] = items;
    props.onChange({
      image: nextMain?.raw ?? "",
      image_public_url: nextMain?.preview ?? "",
      images: nextAdditional.map((image, index) => ({ image: image.raw, public_url: image.preview, sort_order: index }))
    });
    setSelectedImageUrl(moved.preview);
  }

  function removeGalleryImage(index: number) {
    if (index < 0 || index >= galleryImages.length) return;
    const removedImage = galleryImages[index]?.preview ?? "";
    const next = galleryImages.filter((_, idx) => idx !== index);
    const [nextMain, ...nextAdditional] = next;
    const nextPendingUploads = props.draft.pending_uploads.filter((item) => item.preview_url !== removedImage);
    props.onChange({
      image: nextMain?.raw ?? "",
      image_public_url: nextMain?.preview ?? "",
      images: nextAdditional.map((image, idx) => ({ image: image.raw, public_url: image.preview, sort_order: idx })),
      pending_uploads: nextPendingUploads
    });
    revokeTrackedObjectUrl(removedImage);
    if (selectedImageUrl === galleryImages[index]?.preview) {
      setSelectedImageUrl(nextMain?.preview ?? nextAdditional[0]?.preview ?? "");
    }
  }

  function setMainCategory(categoryId: number) {
    patchCategoriesForSite(activeSiteKey, currentCategories.map((item) => ({ ...item, main_category: item.category_id === categoryId })));
  }

  function toggleCategoryExpand(categoryId: number) {
    setExpandedCategoryIdsBySite((prev) => {
      const next = new Set(prev[activeSiteKey] ?? []);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return {
        ...prev,
        [activeSiteKey]: next
      };
    });
  }

  function patchCategoriesForSite(siteKey: ProductEditorJvSiteKey, categories: ProductEditorJvCategory[]) {
    const normalized = normalizeCategorySelection(categories);
    const nextBySiteKey = {
      ...categoriesBySiteKey,
      [siteKey]: normalized
    };
    props.onChange({
      categories_by_site_key: nextBySiteKey,
      categories: siteKey === baselineSiteKey ? normalized : (nextBySiteKey[baselineSiteKey] ?? props.draft.categories)
    });
  }

  function applyPublishingSelections(selections: JvPublishingSelections) {
    const nextCategoriesBySiteKey = {
      ...categoriesBySiteKey,
      ...Object.fromEntries(JV_SITE_TABS.map(({ key }) => {
        const publishingKey = key as JvPublishingSiteKey;
        const selectedIds = selections.rubricIdsBySite[publishingKey] ?? [];
        const mainId = selections.mainRubricIdBySite[publishingKey] ?? selectedIds[0] ?? null;
        return [key, selectedIds.map((category_id) => ({ category_id, main_category: category_id === mainId }))];
      })),
    };
    const nextFieldsBySiteKey: ProductEditorJvFieldsBySiteKey = {
      ...props.draft.jv_fields_by_site_key,
      ...Object.fromEntries(JV_SITE_TABS.map(({ key }) => {
        const publishingKey = key as JvPublishingSiteKey;
        const deliveryId = selections.deliveryIdsBySite[publishingKey]?.[0];
        const current = props.draft.jv_fields_by_site_key[key] ?? {};
        return [key, {
          ...current,
          lieferzeitid: deliveryId == null ? "" : String(deliveryId),
          lieferzeit: deliveryId == null ? "" : String(deliveryId),
          lieferzeit_id: deliveryId == null ? "" : String(deliveryId),
        }];
      })),
    };
    const jvBaselineSiteKey = baselineSiteKey as JvPublishingSiteKey;
    const baselineDeliveryId = selections.deliveryIdsBySite[jvBaselineSiteKey]?.[0];
    props.onChange({
      categories_by_site_key: nextCategoriesBySiteKey,
      categories: nextCategoriesBySiteKey[baselineSiteKey] ?? props.draft.categories,
      jv_fields_by_site_key: nextFieldsBySiteKey,
      jv_fields: baselineDeliveryId == null ? props.draft.jv_fields : {
        ...props.draft.jv_fields,
        lieferzeitid: String(baselineDeliveryId),
        lieferzeit: String(baselineDeliveryId),
        lieferzeit_id: String(baselineDeliveryId),
      },
    });
  }

  return (
    <ProductEditorPanelLayout
      kicker={props.draft.ean ? `EAN ${props.draft.ean}` : "EAN -"}
      title={props.draft.ean ? `EAN: ${props.draft.ean}` : "EAN: -"}
      changedCount={changedFields.length}
      status={props.draft.target_id || undefined}
      headerLead={
        <div className="min-w-0">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
            <FormField label="EAN" className="min-w-0 flex-1">
              <Input
                value={props.eanValue}
                onChange={(event) => props.onChangeEan(event.target.value)}
                placeholder={t.enterEanSkuOrProductId}
                maxLength={100}
                className="h-10 rounded-xl border-border bg-background text-sm"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && props.isEanValid && !props.searching) {
                    event.preventDefault();
                    props.onSearch();
                  }
                }}
              />
            </FormField>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl px-4 text-sm font-semibold"
              disabled={!props.isEanValid || props.searching}
              onClick={props.onSearch}
            >
              {props.searching ? t.searchingShort : t.productEditorDiscoverAction}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 rounded-xl px-4 text-sm font-semibold"
              onClick={props.onApplyEditedProducts}
              disabled={Boolean(props.batchApplyLoading) || (changedFields.length === 0 && pendingUploadCount === 0)}
            >
              {props.batchApplyLoading ? t.updating : t.updateEditedProducts}
            </Button>
          </div>
          {props.draft.ean ? <p className="mt-2 text-xs text-muted-foreground">{t.loadedProduct.replace("{ean}", props.draft.ean)}{isXlMode ? ` · ${t.productEditorXlSourceSite}` : ""}</p> : null}
        </div>
      }
      headerActions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {pendingUploadCount > 0 ? (
            <StatusBadge tone="planned">{t.productEditorImagesPending.replace("{count}", String(pendingUploadCount))}</StatusBadge>
          ) : null}
          {isInlineProgressVisible ? (
            <>
              <StatusBadge tone={jobStatus === "failed" ? "missing" : jobStatus === "completed" ? "found" : "planned"}>
                {progressMessage || progressPhase || jobStatus || t.productEditorRunning}
              </StatusBadge>
              <StatusBadge tone={jobStatus === "failed" ? "missing" : "planned"}>
                {progressCompleted}/{progressTotal || progressCompleted || 0}
              </StatusBadge>
            </>
          ) : null}
        </div>
      }
      topLeft={<>
        <ProductEditorJvCreateForm draft={props.draft} onChange={props.onChange} />
        <div className="hidden flex h-full flex-col rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.productNameLabel}</p>
          <Input value={productName} onChange={(event) => patchPrimaryName(event.target.value)} className="h-11 rounded-xl border-border bg-white text-sm" />
          <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.xljvUrlKey}</p>
          <Input value={String(urlKeyValue)} readOnly disabled className="h-11 rounded-xl border-border bg-muted/40 text-sm text-muted-foreground" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.priceLabel}</p>
              <Input value={String(priceValue)} onChange={(event) => patchPrice(event.target.value)} className="h-11 rounded-xl border-border bg-white text-sm" />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.xljvUvpPrice}</p>
              <Input value={String(uvpValue)} readOnly disabled className="h-11 rounded-xl border-border bg-muted/40 text-sm text-muted-foreground" />
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-foreground">{t.sofortLabel}</p>
              </div>
              <Switch checked={isSofortEnabled} onChange={(event) => patchIsSofortEnabled(event.target.checked)} aria-label={t.sofortLabel} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-foreground">{t.activeLabel}</p>
              </div>
              <Switch checked={isInactiveEnabled} onChange={(event) => patchInaktivEnabled(event.target.checked)} aria-label={t.activeLabel} />
            </label>
          </div>
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.deliveryLabel}</p>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{activeSiteKey}</span>
              </div>
              {isXlMode ? (
                <div className="mt-2 rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                  XL DE does not expose JV-style delivery options here.
                </div>
              ) : (
                <>
                  <SiteTabBar
                    siteTabs={siteTabs}
                    activeSiteKey={activeSiteKey}
                    onChange={setActiveSiteKey}
                    renderMeta={(siteKey) => getDeliverySelectionLabel(deliveryValuesBySiteKey[siteKey] ?? "", t.notSelected)}
                  />
                  <select
                    value={deliveryIdValue}
                    onChange={(event) => patchDeliveryId(event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    {deliveryOptions.length === 0 ? (
                      <option value={deliveryIdValue || ""}>{deliveryIdValue || "No delivery options"}</option>
                    ) : (
                      deliveryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))
                    )}
                  </select>
                </>
              )}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.metaTitleLabel}</p>
              <Textarea value={metaTitleValue} onChange={(event) => patchPrimaryMetaTitle(event.target.value)} className="min-h-16 rounded-xl border-border bg-white font-sans text-sm" />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.metaDescriptionLabel}</p>
              <Input value={metaDescriptionValue} onChange={(event) => patchPrimaryMetaDescription(event.target.value)} className="h-11 rounded-xl border-border bg-white text-sm" />
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.metaKeywordLabel}</p>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.linesLabel.replace("{count}", String(metaKeywordLineCount))}</span>
              </div>
              <Textarea value={metaKeywordValue} onChange={(event) => patchPrimaryMetaKeyword(event.target.value)} className="min-h-40 rounded-xl border-border bg-white font-sans text-sm" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.bezeichnungLabel}</p>
              <Textarea value={bezeichnungValue} onChange={(event) => patchBezeichnung(event.target.value)} className="min-h-44 flex-1 rounded-xl border-border bg-white font-sans text-sm" />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.kurzbeschreibungLabel}</p>
              <Textarea value={kurzbeschreibungValue} onChange={(event) => patchKurzbeschreibung(event.target.value)} className="min-h-16 rounded-xl border-border bg-white font-sans text-sm" />
            </div>
          </div>
        </div>
      </>}
      topRight={
        <div className="space-y-4">
          <CreateProductImageGallery
            items={galleryItems.map((item) => ({ ...item, isLocal: false }))}
            activeItemId={selectedGalleryItemId}
            previewAlt={t.createProductJvGalleryPreview}
            uploadLabel={t.productEditorUploadImagesAction}
            emptyPreviewLabel={t.productEditorNoImage}
            emptyGalleryLabel={t.productEditorNoGalleryImages}
            thumbnailAlt={(index) => t.createProductJvGalleryThumbnail.replace("{index}", String(index + 1))}
            deleteAlt={(index) => t.createProductDeleteImage.replace("{index}", String(index + 1))}
            onActiveItemChange={(itemId) => {
              const item = galleryItems.find((entry) => entry.id === itemId);
              if (item) {
                setSelectedImageUrl(item.src);
              }
            }}
            onDeleteItem={(itemId) => {
              const itemIndex = galleryItems.findIndex((entry) => entry.id === itemId);
              if (itemIndex >= 0) {
                removeGalleryImage(itemIndex);
              }
            }}
            onMoveItem={(sourceItemId, targetItemId) => {
              const sourceIndex = galleryItems.findIndex((entry) => entry.id === sourceItemId);
              const targetIndex = galleryItems.findIndex((entry) => entry.id === targetItemId);
              if (sourceIndex >= 0 && targetIndex >= 0) {
                moveGalleryImage(sourceIndex, targetIndex);
              }
            }}
            onFilesSelected={handleUploadImages}
          />

          {!isXlMode ? (
            <JvPublishingOptionsPanel
              sourceSiteKey={baselineSiteKey}
              sourceCategories={(categoriesBySiteKey[baselineSiteKey] ?? props.draft.categories).map((category) => ({
                category_id: category.category_id,
                main_category: Boolean(category.main_category),
              }))}
              sourceDeliveryId={Number(deliveryValuesBySiteKey[baselineSiteKey] ?? "") || undefined}
              initialSelections={publishingSelections}
              initialSelectionKey={publishingSelectionKey}
              onSelectionsChange={applyPublishingSelections}
            />
          ) : null}
        </div>
      }
      description={
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.descriptionLabel}</p>
            <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setDescriptionMode("code")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  descriptionMode === "code" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.codeLabel}
              </button>
              <button
                type="button"
                onClick={() => setDescriptionMode("preview")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  descriptionMode === "preview" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.previewLabel}
              </button>
            </div>
          </div>

          {descriptionMode === "code" ? (
            <Textarea
              value={descriptionValue}
              onChange={(event) => patchPrimaryDescription(event.target.value)}
              className="min-h-[32rem] rounded-xl border-border bg-white font-sans text-sm"
            />
          ) : (
            <div className="max-h-[32rem] overflow-auto rounded-xl border border-border bg-white p-4">
              {descriptionValue.trim() ? (
                <div
                  className="text-sm leading-6 outline-none"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(event) => patchPrimaryDescription(event.currentTarget.innerHTML)}
                  dangerouslySetInnerHTML={{ __html: descriptionPreviewHtml }}
                />
              ) : (
                <div
                  className="text-sm text-muted-foreground outline-none"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(event) => patchPrimaryDescription(event.currentTarget.innerHTML)}
                >
                  {t.noDescription}
                </div>
              )}
            </div>
          )}
        </div>
      }
      bottom={<></>}
    />
  );
}

async function loadCachedJvDeliveryOptions(siteKey: ProductEditorJvSiteKey): Promise<ProductEditorJvDeliveryOption[]> {
  if (cachedDeliveryOptionsBySite[siteKey]) {
    return cachedDeliveryOptionsBySite[siteKey] ?? [];
  }
  if (!deliveryOptionsPromiseBySite[siteKey]) {
    deliveryOptionsPromiseBySite[siteKey] = getJvDeliveryOptions(siteKey)
      .then((options) => {
        cachedDeliveryOptionsBySite = { ...cachedDeliveryOptionsBySite, [siteKey]: options };
        return options;
      })
      .finally(() => {
        deliveryOptionsPromiseBySite = { ...deliveryOptionsPromiseBySite, [siteKey]: undefined };
      });
  }
  return deliveryOptionsPromiseBySite[siteKey] ?? [];
}

async function loadCachedJvRubricTree(siteKey: ProductEditorJvSiteKey): Promise<ProductEditorJvRubricNode[]> {
  if (cachedRubricTreeBySite[siteKey]) {
    return cachedRubricTreeBySite[siteKey] ?? [];
  }
  if (!rubricTreePromiseBySite[siteKey]) {
    rubricTreePromiseBySite[siteKey] = getJvRubricTree(siteKey)
      .then((tree) => {
        cachedRubricTreeBySite = { ...cachedRubricTreeBySite, [siteKey]: tree };
        return tree;
      })
      .finally(() => {
        rubricTreePromiseBySite = { ...rubricTreePromiseBySite, [siteKey]: undefined };
      });
  }
  return rubricTreePromiseBySite[siteKey] ?? [];
}

async function loadCachedXlRubricTree(siteKey: ProductEditorJvSiteKey): Promise<ProductEditorJvRubricNode[]> {
  if (cachedRubricTreeBySite[siteKey]) {
    return cachedRubricTreeBySite[siteKey] ?? [];
  }
  if (!rubricTreePromiseBySite[siteKey]) {
    rubricTreePromiseBySite[siteKey] = getXlRubricTree(siteKey)
      .then((tree) => {
        cachedRubricTreeBySite = { ...cachedRubricTreeBySite, [siteKey]: tree };
        return tree;
      })
      .finally(() => {
        rubricTreePromiseBySite = { ...rubricTreePromiseBySite, [siteKey]: undefined };
      });
  }
  return rubricTreePromiseBySite[siteKey] ?? [];
}

type CategoryTreeRowProps = {
  node: ProductEditorJvRubricNode;
  level: number;
  expandedCategoryIds: Set<number>;
  selectedCategoryIds: Set<number>;
  mainCategoryId: number | null;
  radioName: string;
  onToggleExpand: (categoryId: number) => void;
  onToggleSelect: (categoryId: number, checked: boolean) => void;
  onSetMainCategory: (categoryId: number) => void;
};

function CategoryTreeRow(props: CategoryTreeRowProps) {
  const t = useLabels();
  const hasChildren = props.node.children.length > 0;
  const expanded = props.expandedCategoryIds.has(props.node.id);
  const selected = props.selectedCategoryIds.has(props.node.id);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 text-xs",
          hasChildren ? "border-b-0" : "border-b border-border/70 last:border-b-0",
          selected ? "bg-emerald-50/70 text-emerald-700" : "text-foreground"
        )}
        style={{ paddingLeft: `${8 + props.level * 16}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && props.onToggleExpand(props.node.id)}
          className="relative w-4 text-center text-transparent"
        >
          <span className="absolute inset-0 text-muted-foreground" aria-hidden>
            {hasChildren ? (expanded ? "\u25BE" : "\u25B8") : ""}
          </span>
          {hasChildren ? (expanded ? "▾" : "▸") : ""}
        </button>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border accent-emerald-600"
          checked={selected}
          onChange={(event) => props.onToggleSelect(props.node.id, event.target.checked)}
        />
        <span className="flex-1 truncate">{props.node.name}</span>
        {selected && props.mainCategoryId === props.node.id ? (
          <span className="inline-flex shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-700">
            {t.productEditorMainCategory}
          </span>
        ) : null}
        {selected ? (
          <input
            type="radio"
            name={props.radioName}
            className="h-4 w-4 shrink-0 accent-emerald-600"
            checked={props.mainCategoryId === props.node.id}
            onChange={() => props.onSetMainCategory(props.node.id)}
            title={t.productEditorMainCategory}
            aria-label={t.productEditorSetMainCategoryAria.replace("{name}", props.node.name)}
          />
        ) : null}
      </div>
      {hasChildren && expanded
        ? props.node.children.map((child) => (
            <CategoryTreeRow
              key={child.id}
              node={child}
              level={props.level + 1}
              expandedCategoryIds={props.expandedCategoryIds}
              selectedCategoryIds={props.selectedCategoryIds}
              mainCategoryId={props.mainCategoryId}
              radioName={props.radioName}
              onToggleExpand={props.onToggleExpand}
              onToggleSelect={props.onToggleSelect}
              onSetMainCategory={props.onSetMainCategory}
            />
          ))
        : null}
    </div>
  );
}

type SiteTabBarProps = {
  siteTabs: ReadonlyArray<{ key: ProductEditorJvSiteKey; label: string }>;
  activeSiteKey: ProductEditorJvSiteKey;
  onChange: (siteKey: ProductEditorJvSiteKey) => void;
  renderMeta: (siteKey: ProductEditorJvSiteKey) => string;
};

function SiteTabBar(props: SiteTabBarProps) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {props.siteTabs.map((site) => {
        const active = site.key === props.activeSiteKey;
        return (
          <button
            key={site.key}
            type="button"
            onClick={() => props.onChange(site.key)}
            className={cn(
              "rounded-xl border px-3 py-2 text-left transition",
              active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-border bg-white text-foreground hover:border-emerald-200"
            )}
          >
            <div className="text-xs font-semibold">{site.label}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{props.renderMeta(site.key)}</div>
          </button>
        );
      })}
    </div>
  );
}

function collectAllCategoryIds(nodes: ProductEditorJvRubricNode[]): Set<number> {
  const ids = new Set<number>();
  const walk = (list: ProductEditorJvRubricNode[]) => {
    for (const node of list) {
      ids.add(node.id);
      if (node.children.length > 0) walk(node.children);
    }
  };
  walk(nodes);
  return ids;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function resolveJvBaselineSiteKey(draft: ProductEditorJvDraft): ProductEditorJvSiteKey {
  const candidate = String(draft.target_id || draft.jv_fields?.site_key || "").trim().toUpperCase();
  return ALL_STRUCTURED_SITE_TABS.some((site) => site.key === candidate) ? (candidate as ProductEditorJvSiteKey) : "JV_DE";
}

function ProductEditorJvCreateForm({ draft, onChange }: { draft: ProductEditorJvDraft; onChange: (patch: Partial<ProductEditorJvDraft>) => void }) {
  const t = useLabels();
  const content = getJvContentByLanguage(draft.jv_fields, "de");
  const [descriptionMode, setDescriptionMode] = useState<"code" | "preview">("preview");
  const fields = {
    name: String(content?.name ?? ""), urlKey: String(draft.jv_fields?.urlkey ?? ""), artikelnr: String(draft.source_sku ?? draft.jv_fields?.artikelnr ?? ""), price: draft.price, evp: String(draft.jv_fields?.uvp ?? ""),
    bezeichnung: String(content?.bezeichnung ?? content?.short_description ?? ""), kurzbeschreibung: String(content?.kurzbeschreibung ?? ""), shortDescriptionReal: String(content?.short_description_real ?? ""),
    metaTitle: String(content?.meta_title ?? ""), metaDescription: String(content?.meta_description ?? ""), metaKeyword: String(content?.meta_keyword ?? ""), description: String(content?.description ?? ""),
  };
  const patchContent = (patch: Record<string, string>) => onChange({ jv_fields: setJvContentByLanguage(draft.jv_fields, "de", patch) });
  return <JvCreateProductPanel fields={fields} previewHtml={normalizeDescriptionHtmlForPreview(fields.description)} descriptionMode={descriptionMode} labels={{ name: t.productNameLabel, urlKey: t.xljvUrlKey, artikelnr: t.articleNumber, price: t.priceLabel, bezeichnung: t.bezeichnungLabel, kurzbeschreibung: t.kurzbeschreibungLabel, shortDescriptionReal: t.xljvShortDescriptionDe, metaTitle: t.metaTitleLabel, metaDescription: t.metaDescriptionLabel, metaKeyword: t.metaKeywordLabel, description: t.descriptionLabel, keywordPlaceholder: t.productEditorKeywordsCommaSeparated, code: t.codeLabel, preview: t.previewLabel }} onFieldDraftChange={(key, value) => {
    if (key === "price") { onChange({ price: value }); return; }
    if (key === "artikelnr") { onChange({ source_sku: value, jv_fields: { ...draft.jv_fields, artikelnr: value } }); return; }
    if (key === "name") { patchContent({ name: value }); return; }
    if (key === "bezeichnung") { patchContent({ bezeichnung: value, short_description: value }); return; }
    if (key === "kurzbeschreibung") { patchContent({ kurzbeschreibung: value }); return; }
    if (key === "shortDescriptionReal") { patchContent({ short_description_real: value }); return; }
    if (key === "metaTitle") { patchContent({ meta_title: value }); return; }
    if (key === "metaDescription") { patchContent({ meta_description: value }); return; }
    if (key === "metaKeyword") { patchContent({ meta_keyword: value }); return; }
    if (key === "description") patchContent({ description: value });
  }} onDescriptionModeChange={setDescriptionMode} buildUrlKey={buildUrlKeyFromName} computeEvp={(value) => { const price = parsePriceValue(value); return price === null ? "" : String(calculateUvpRoundedTo9(price)); }} />;
}

function normalizeCategorySelection(categories: ProductEditorJvCategory[]): ProductEditorJvCategory[] {
  const seen = new Set<number>();
  const normalized = categories.filter((item) => {
    const categoryId = Number(item.category_id);
    if (!Number.isFinite(categoryId) || categoryId <= 0 || seen.has(categoryId)) return false;
    seen.add(categoryId);
    return true;
  }).map((item) => ({ category_id: Number(item.category_id), main_category: Boolean(item.main_category) }));
  if (normalized.length === 0) return [];
  const mainCategoryId = normalized.find((item) => item.main_category)?.category_id ?? normalized[0].category_id;
  return normalized.map((item) => ({ ...item, main_category: item.category_id === mainCategoryId }));
}

function getDraftCategoriesBySiteKey(
  draft: ProductEditorJvDraft,
  baselineSiteKey: ProductEditorJvSiteKey
): Partial<Record<ProductEditorJvSiteKey, ProductEditorJvCategory[]>> {
  const next: Partial<Record<ProductEditorJvSiteKey, ProductEditorJvCategory[]>> = {};
  for (const site of ALL_STRUCTURED_SITE_TABS) {
    const categories = draft.categories_by_site_key[site.key] ?? (site.key === baselineSiteKey ? draft.categories : []);
    next[site.key] = normalizeCategorySelection(categories);
  }
  return next;
}

function getDraftDeliveryValuesBySiteKey(
  draft: ProductEditorJvDraft,
  baselineSiteKey: ProductEditorJvSiteKey
): Partial<Record<ProductEditorJvSiteKey, string>> {
  const next: Partial<Record<ProductEditorJvSiteKey, string>> = {};
  for (const site of ALL_STRUCTURED_SITE_TABS) {
    const siteFields = draft.jv_fields_by_site_key[site.key] ?? {};
    const baselineValue = site.key === baselineSiteKey ? draft.jv_fields?.lieferzeitid : "";
    next[site.key] = String(siteFields.lieferzeitid ?? baselineValue ?? "").trim();
  }
  return next;
}

function getDeliverySelectionLabel(value: string, notSelectedLabel: string): string {
  return value.trim() ? `ID ${value}` : notSelectedLabel;
}

function filterCategoryTree(
  nodes: ProductEditorJvRubricNode[],
  query: string,
  selectedCategoryIds: Set<number>,
  onlyChecked: boolean
): ProductEditorJvRubricNode[] {
  const q = query.trim().toLowerCase();

  const filterNode = (node: ProductEditorJvRubricNode): ProductEditorJvRubricNode | null => {
    const ownQueryMatch = !q || node.name.toLowerCase().includes(q) || String(node.id).includes(q);
    const ownCheckedMatch = !onlyChecked || selectedCategoryIds.has(node.id);
    const ownMatch = ownQueryMatch && ownCheckedMatch;
    const children = node.children
      .map((child) => filterNode(child))
      .filter((row): row is ProductEditorJvRubricNode => Boolean(row));
    if (!ownMatch && children.length === 0) return null;
    return { ...node, children };
  };

  return nodes
    .map((node) => filterNode(node))
    .filter((row): row is ProductEditorJvRubricNode => Boolean(row));
}

function buildUrlKeyFromName(name: string): string {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join("+");
}

function parsePriceValue(value: string): number | null {
  const normalized = String(value || "").replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function calculateUvpRoundedTo9(price: number): number {
  let value: number;
  if (price > 5000) {
    value = price * 1.1;
  } else if (price >= 2500 && price <= 4999) {
    value = price * 1.18;
  } else if (price >= 1000 && price <= 2499) {
    value = price * 1.25;
  } else {
    value = price * 1.35;
  }

  // Round up to the nearest integer ending with 9.
  const rounded = Math.ceil(value);
  const lastDigit = rounded % 10;
  if (lastDigit === 9) return rounded;
  return rounded + (9 - lastDigit);
}

function countNonEmptyLines(value: string): number {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}

function buildPendingUploadEntry(file: File, previewUrl: string, index: number) {
  return {
    id: `${file.name}-${file.size}-${Date.now()}-${index}`,
    name: file.name,
    size: file.size,
    type: file.type,
    preview_url: previewUrl,
    file,
  };
}

function dedupePendingUploads(pendingUploads: ProductEditorJvDraft["pending_uploads"]): ProductEditorJvDraft["pending_uploads"] {
  const seen = new Set<string>();
  const result: ProductEditorJvDraft["pending_uploads"] = [];
  for (const item of pendingUploads) {
    const previewUrl = String(item.preview_url || "").trim();
    const signature = previewUrl || `${item.name}-${item.size}`;
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    result.push(item);
  }
  return result;
}

function normalizeJvImageUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("cosmoshop/")) return `https://jvmoebel.de/${raw}`;
  if (raw.startsWith("/")) return `https://jvmoebel.de${raw}`;
  return `https://jvmoebel.de/${raw}`;
}

type JvGalleryImage = {
  raw: string;
  preview: string;
};

function resolveJvPreviewUrl(rawValue: string, publicUrl?: string): string {
  const explicitPublicUrl = String(publicUrl ?? "").trim();
  if (explicitPublicUrl) return normalizeJvImageUrl(explicitPublicUrl);
  return normalizeJvImageUrl(rawValue);
}

function buildJvGalleryState(draft: ProductEditorJvDraft): { mainImage: JvGalleryImage; additionalImages: JvGalleryImage[]; allImages: JvGalleryImage[] } {
  const mainImage: JvGalleryImage = {
    raw: String(draft.image || "").trim(),
    preview: resolveJvPreviewUrl(draft.image, draft.image_public_url),
  };
  const additionalImages = getAdditionalImageEntries(draft, mainImage);
  const allImages = [mainImage, ...additionalImages].filter((item) => item.preview.trim() !== "");
  return { mainImage, additionalImages, allImages };
}

function buildGalleryItemId(url: string, index: number): string {
  return `${index}:${url}`;
}

function getAdditionalImageEntries(draft: ProductEditorJvDraft, mainImage: JvGalleryImage): JvGalleryImage[] {
  const seen = new Set<string>();
  const result: JvGalleryImage[] = [];
  if (mainImage.preview) {
    seen.add(mainImage.preview.toLowerCase());
  }
  for (const row of draft.images) {
    const normalized = resolveJvPreviewUrl(row.image, row.public_url);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      raw: String(row.image || "").trim(),
      preview: normalized,
    });
  }
  return result;
}

function getJvContentByLanguage(fields: Record<string, unknown>, languageCode: string): Record<string, unknown> | null {
  const rows = Array.isArray(fields.content_by_language) ? fields.content_by_language : [];
  for (const row of rows) {
    const item = row as Record<string, unknown>;
    const code = String(item.language_code ?? "de").toLowerCase();
    if (code === languageCode.toLowerCase()) {
      return item;
    }
  }
  return null;
}

function setJvContentByLanguage(
  fields: Record<string, unknown>,
  languageCode: string,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const rows = Array.isArray(fields.content_by_language) ? [...fields.content_by_language] : [];
  const normalizedCode = languageCode.toLowerCase();
  const index = rows.findIndex((row) => {
    const item = row as Record<string, unknown>;
    return String(item.language_code ?? "de").toLowerCase() === normalizedCode;
  });

  if (index >= 0) {
    const current = rows[index] as Record<string, unknown>;
    rows[index] = { ...current, ...patch, language_code: current.language_code ?? languageCode };
  } else {
    rows.push({ language_code: languageCode, ...patch });
  }

  return { ...fields, content_by_language: rows };
}

function normalizeDeliverySelectValue(value: string, options: ProductEditorJvDeliveryOption[]): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (options.some((option) => option.value === normalized)) {
    return normalized;
  }
  const byLabel = options.find((option) => option.label.trim().toLowerCase() === normalized.toLowerCase());
  return byLabel?.value ?? normalized;
}

function normalizeDescriptionHtmlForPreview(html: string): string {
  const value = String(html || "");
  if (!value) return "";
  return value
    .replace(/%HOST%/gi, "https://www.jvmoebel.de")
    .replace(/src=(['"])\/cosmoshop\//gi, 'src=$1https://www.jvmoebel.de/cosmoshop/')
    .replace(/href=(['"])\/cosmoshop\//gi, 'href=$1https://www.jvmoebel.de/cosmoshop/')
    .replace(/href=(['"])\/Infos\//gi, 'href=$1https://www.jvmoebel.de/Infos/');
}
