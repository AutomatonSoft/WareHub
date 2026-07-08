"use client";

import { useEffect, useRef, useState } from "react";
import { ProductEditorPanelLayout } from "./product-editor-shared-panels";
import { buildJvChangedFields } from "./product-editor-model";
import {
  getJvDeliveryOptions,
  getJvRubricTree,
  type ProductEditorJvDeliveryOption,
  type ProductEditorJvRubricNode
} from "./product-editor-api";
import { ProductEditorGalleryCard } from "./product-editor-gallery-card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { StatusBadge } from "../ui/status-badge";
import { cn } from "../../lib/cn";
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
let cachedDeliveryOptionsBySite: Partial<Record<ProductEditorJvSiteKey, ProductEditorJvDeliveryOption[]>> = {};
let deliveryOptionsPromiseBySite: Partial<Record<ProductEditorJvSiteKey, Promise<ProductEditorJvDeliveryOption[]>>> = {};
let cachedRubricTreeBySite: Partial<Record<ProductEditorJvSiteKey, ProductEditorJvRubricNode[]>> = {};
let rubricTreePromiseBySite: Partial<Record<ProductEditorJvSiteKey, Promise<ProductEditorJvRubricNode[]>>> = {};

type ProductEditorJvPanelProps = {
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
        JV_SITE_TABS.map(async ({ key }) => {
          try {
            return [key, await loadCachedJvDeliveryOptions(key)] as const;
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
  }, []);

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
        JV_SITE_TABS.map(async ({ key }) => {
          try {
            const tree = await loadCachedJvRubricTree(key);
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
  }, []);

  const categoriesBySiteKey = getDraftCategoriesBySiteKey(props.draft, baselineSiteKey);
  const currentCategories = categoriesBySiteKey[activeSiteKey] ?? [];
  const selectedCategoryIds = new Set(currentCategories.map((item) => item.category_id));
  const mainCategoryId = currentCategories.find((item) => item.main_category)?.category_id ?? null;
  const categoryTree = categoryTreeBySite[activeSiteKey] ?? [];
  const expandedCategoryIds = expandedCategoryIdsBySite[activeSiteKey] ?? new Set<number>();
  const filteredCategoryTree = filterCategoryTree(categoryTree, categoryQuery, selectedCategoryIds, onlyCheckedCategories);
  const deliveryOptions = deliveryOptionsBySite[activeSiteKey] ?? [];
  const deliveryValuesBySiteKey = getDraftDeliveryValuesBySiteKey(props.draft, baselineSiteKey);
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

  return (
    <ProductEditorPanelLayout
      kicker={props.draft.ean ? `EAN ${props.draft.ean}` : "EAN -"}
      title={props.draft.ean ? `EAN: ${props.draft.ean}` : "EAN: -"}
      changedCount={changedFields.length}
      status={props.draft.target_id || undefined}
      headerLead={
        <div className="min-w-0">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Input
              value={props.eanValue}
              onChange={(event) => props.onChangeEan(event.target.value)}
              placeholder="Enter EAN, SKU or product ID"
              maxLength={100}
              className="h-10 min-w-0 flex-1 rounded-xl border-border bg-background text-sm"
              onKeyDown={(event) => {
                if (event.key === "Enter" && props.isEanValid && !props.searching) {
                  event.preventDefault();
                  props.onSearch();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl px-4 text-sm font-semibold"
              disabled={!props.isEanValid || props.searching}
              onClick={props.onSearch}
            >
              {props.searching ? "Searching..." : "Discover"}
            </Button>
          </div>
          {props.draft.ean ? <p className="mt-2 text-xs text-muted-foreground">Loaded product: {props.draft.ean}</p> : null}
        </div>
      }
      headerActions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {pendingUploadCount > 0 ? (
            <StatusBadge tone="planned">Images pending {pendingUploadCount}</StatusBadge>
          ) : null}
          {isInlineProgressVisible ? (
            <>
              <StatusBadge tone={jobStatus === "failed" ? "missing" : jobStatus === "completed" ? "found" : "planned"}>
                {progressMessage || progressPhase || jobStatus || "running"}
              </StatusBadge>
              <StatusBadge tone={jobStatus === "failed" ? "missing" : "planned"}>
                {progressCompleted}/{progressTotal || progressCompleted || 0}
              </StatusBadge>
            </>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl text-xs font-semibold"
            onClick={props.onApplyEditedProducts}
            disabled={Boolean(props.batchApplyLoading) || (changedFields.length === 0 && pendingUploadCount === 0)}
          >
            {props.batchApplyLoading ? "Updating..." : "Update Edited Products"}
          </Button>
        </div>
      }
      topLeft={
        <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Product name</p>
          <Input value={productName} onChange={(event) => patchPrimaryName(event.target.value)} className="h-11 rounded-xl border-border bg-white text-sm" />
          <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">urlkey</p>
          <Input value={String(urlKeyValue)} readOnly disabled className="h-11 rounded-xl border-border bg-muted/40 text-sm text-muted-foreground" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Price</p>
              <Input value={String(priceValue)} onChange={(event) => patchPrice(event.target.value)} className="h-11 rounded-xl border-border bg-white text-sm" />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">UVP</p>
              <Input value={String(uvpValue)} readOnly disabled className="h-11 rounded-xl border-border bg-muted/40 text-sm text-muted-foreground" />
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-foreground">Sofort</p>
              </div>
              <Switch checked={isSofortEnabled} onChange={(event) => patchIsSofortEnabled(event.target.checked)} aria-label="Toggle is_sofort enabled state" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-foreground">Active</p>
              </div>
              <Switch checked={isInactiveEnabled} onChange={(event) => patchInaktivEnabled(event.target.checked)} aria-label="Toggle inaktiv enabled state" />
            </label>
          </div>
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">delivery</p>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{activeSiteKey}</span>
              </div>
              <SiteTabBar
                activeSiteKey={activeSiteKey}
                onChange={setActiveSiteKey}
                renderMeta={(siteKey) => getDeliverySelectionLabel(deliveryValuesBySiteKey[siteKey] ?? "")}
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
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">meta_title</p>
              <Textarea value={metaTitleValue} onChange={(event) => patchPrimaryMetaTitle(event.target.value)} className="min-h-16 rounded-xl border-border bg-white font-sans text-sm" />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">meta_description</p>
              <Input value={metaDescriptionValue} onChange={(event) => patchPrimaryMetaDescription(event.target.value)} className="h-11 rounded-xl border-border bg-white text-sm" />
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">meta_keyword</p>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Lines: {metaKeywordLineCount}</span>
              </div>
              <Textarea value={metaKeywordValue} onChange={(event) => patchPrimaryMetaKeyword(event.target.value)} className="min-h-40 rounded-xl border-border bg-white font-sans text-sm" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">bezeichnung</p>
              <Textarea value={bezeichnungValue} onChange={(event) => patchBezeichnung(event.target.value)} className="min-h-44 flex-1 rounded-xl border-border bg-white font-sans text-sm" />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">kurzbeschreibung</p>
              <Textarea value={kurzbeschreibungValue} onChange={(event) => patchKurzbeschreibung(event.target.value)} className="min-h-16 rounded-xl border-border bg-white font-sans text-sm" />
            </div>
          </div>
        </div>
      }
      topRight={
        <div className="space-y-4">
          <ProductEditorGalleryCard
            items={galleryItems}
            selectedItemId={selectedGalleryItemId}
            uploadLoading={false}
            uploadButtonLabel="Upload images"
            emptyPreviewLabel="No image"
            emptyGalleryLabel="No gallery images"
            onSelectItem={(itemId) => {
              const item = galleryItems.find((entry) => entry.id === itemId);
              if (item) {
                setSelectedImageUrl(item.src);
              }
            }}
            onRemoveItem={(itemId) => {
              const itemIndex = galleryItems.findIndex((entry) => entry.id === itemId);
              if (itemIndex >= 0) {
                removeGalleryImage(itemIndex);
              }
            }}
            onReorderItems={(sourceItemId, targetItemId) => {
              const sourceIndex = galleryItems.findIndex((entry) => entry.id === sourceItemId);
              const targetIndex = galleryItems.findIndex((entry) => entry.id === targetItemId);
              if (sourceIndex >= 0 && targetIndex >= 0) {
                moveGalleryImage(sourceIndex, targetIndex);
              }
            }}
            onUploadFiles={handleUploadImages}
          />

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Category</p>
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {activeSiteKey}: {currentCategories.length}
              </span>
            </div>
            <SiteTabBar
              activeSiteKey={activeSiteKey}
              onChange={setActiveSiteKey}
              renderMeta={(siteKey) => String((categoriesBySiteKey[siteKey] ?? []).length)}
            />
            <div className="flex items-center gap-2">
              <Input
                value={categoryQuery}
                onChange={(event) => setCategoryQuery(event.target.value)}
                placeholder="Search category by name or ID"
                className="h-10 rounded-xl border-border bg-white text-sm"
              />
              <Button
                type="button"
                variant={onlyCheckedCategories ? "default" : "outline"}
                className="h-10 shrink-0 rounded-xl px-3 text-xs font-semibold"
                onClick={() => setOnlyCheckedCategories((prev) => !prev)}
              >
                Only checked
              </Button>
            </div>
            <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-border bg-white">
              {filteredCategoryTree.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No categories found</p>
              ) : (
                filteredCategoryTree.map((node) => (
                  <CategoryTreeRow
                    key={node.id}
                    node={node}
                    level={0}
                    expandedCategoryIds={expandedCategoryIds}
                    selectedCategoryIds={selectedCategoryIds}
                    mainCategoryId={mainCategoryId}
                    radioName={`jv-main-category-${activeSiteKey}`}
                    onToggleExpand={toggleCategoryExpand}
                    onToggleSelect={toggleCategory}
                    onSetMainCategory={setMainCategory}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      }
      description={
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">description</p>
            <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setDescriptionMode("code")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  descriptionMode === "code" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Code
              </button>
              <button
                type="button"
                onClick={() => setDescriptionMode("preview")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  descriptionMode === "preview" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Preview
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
                  No description
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
            Main category
          </span>
        ) : null}
        {selected ? (
          <input
            type="radio"
            name={props.radioName}
            className="h-4 w-4 shrink-0 accent-emerald-600"
            checked={props.mainCategoryId === props.node.id}
            onChange={() => props.onSetMainCategory(props.node.id)}
            title="Main category"
            aria-label={`Set ${props.node.name} as main category`}
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
  activeSiteKey: ProductEditorJvSiteKey;
  onChange: (siteKey: ProductEditorJvSiteKey) => void;
  renderMeta: (siteKey: ProductEditorJvSiteKey) => string;
};

function SiteTabBar(props: SiteTabBarProps) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {JV_SITE_TABS.map((site) => {
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
  return JV_SITE_TABS.some((site) => site.key === candidate) ? (candidate as ProductEditorJvSiteKey) : "JV_DE";
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
  for (const site of JV_SITE_TABS) {
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
  for (const site of JV_SITE_TABS) {
    const siteFields = draft.jv_fields_by_site_key[site.key] ?? {};
    const baselineValue = site.key === baselineSiteKey ? draft.jv_fields?.lieferzeitid : "";
    next[site.key] = String(siteFields.lieferzeitid ?? baselineValue ?? "").trim();
  }
  return next;
}

function getDeliverySelectionLabel(value: string): string {
  return value.trim() ? `ID ${value}` : "Not selected";
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
