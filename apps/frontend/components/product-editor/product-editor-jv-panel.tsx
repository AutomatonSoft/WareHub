"use client";

import { useEffect, useRef, useState } from "react";
import { ProductEditorPreviewImage } from "./product-editor-preview-image";
import { ProductEditorPanelLayout } from "./product-editor-shared-panels";
import { buildJvChangedFields } from "./product-editor-model";
import {
  getJvDeliveryOptions,
  getJvRubricTree,
  uploadProductEditorImages,
  type ProductEditorJvDeliveryOption,
  type ProductEditorJvRubricNode
} from "./product-editor-api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/cn";
import type { ProductEditorJvDraft, ProductEditorWarning } from "./product-editor-types";

const JV_SITE_KEYS = ["JV_DE", "JV_CO_UK", "JV_CH", "JV_AT"] as const;
const UPLOAD_MAX_ATTEMPTS_PER_SITE = 12;
const UPLOAD_RETRY_DELAY_MS = 1500;

type ProductEditorJvPanelProps = {
  draft: ProductEditorJvDraft;
  initialDraft: ProductEditorJvDraft;
  loading: boolean;
  warnings: ProductEditorWarning[];
  onChange: (patch: Partial<ProductEditorJvDraft>) => void;
  activeTabLabel?: string;
  batchApplyLoading?: boolean;
  onApplyEditedProducts?: () => void;
};

export function ProductEditorJvPanel(props: ProductEditorJvPanelProps) {
  const changedFields = buildJvChangedFields(props.initialDraft, props.draft);
  const mainImageUrl = normalizeJvImageUrl(props.draft.image);
  const additionalImageUrls = getAdditionalImageUrls(props.draft, mainImageUrl);
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
  const deliveryIdValue = String(props.draft.jv_fields?.lieferzeitid ?? "");
  const urlKeyValue = props.draft.jv_fields?.urlkey ?? "";
  const priceValue = props.draft.price ?? "";
  const uvpValue = props.draft.jv_fields?.uvp ?? "";
  const isSofortDisabled = Number(props.draft.jv_fields?.is_sofort ?? 0) === 0;
  const isInactiveDisabled = Number(props.draft.jv_fields?.inaktiv ?? 1) === 1;
  const isSofortEnabled = !isSofortDisabled;
  const isInactiveEnabled = !isInactiveDisabled;
  const galleryImages = [mainImageUrl, ...additionalImageUrls].filter((item) => item.trim() !== "");
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(mainImageUrl || additionalImageUrls[0] || "");
  const [descriptionMode, setDescriptionMode] = useState<"code" | "preview">("preview");
  const [deliveryOptions, setDeliveryOptions] = useState<ProductEditorJvDeliveryOption[]>([]);
  const [categoryTree, setCategoryTree] = useState<ProductEditorJvRubricNode[]>([]);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<number>>(new Set());
  const [categoryQuery, setCategoryQuery] = useState("");
  const [onlyCheckedCategories, setOnlyCheckedCategories] = useState(false);
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [dragOverImageIndex, setDragOverImageIndex] = useState<number | null>(null);
  const [uploadingImageUrls, setUploadingImageUrls] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<{
    active: boolean;
    label: string;
    percent: number;
  }>({
    active: false,
    label: "",
    percent: 0
  });
  const displayImageUrl = selectedImageUrl || mainImageUrl || additionalImageUrls[0] || "";
  const mainImageInputRef = useRef<HTMLInputElement | null>(null);
  const additionalImagesInputRef = useRef<HTMLInputElement | null>(null);
  const createdObjectUrlsRef = useRef<string[]>([]);
  const latestDraftRef = useRef(props.draft);
  const selectedImageUrlRef = useRef(selectedImageUrl);

  useEffect(() => {
    latestDraftRef.current = props.draft;
  }, [props.draft]);

  useEffect(() => {
    selectedImageUrlRef.current = selectedImageUrl;
  }, [selectedImageUrl]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const options = await getJvDeliveryOptions();
        if (mounted) setDeliveryOptions(options);
      } catch {
        if (mounted) setDeliveryOptions([]);
      }
    })();
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
      try {
        const tree = await getJvRubricTree();
        if (mounted) {
          setCategoryTree(tree);
          setExpandedCategoryIds(collectAllCategoryIds(tree));
        }
      } catch {
        if (mounted) {
          setCategoryTree([]);
          setExpandedCategoryIds(new Set());
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedCategoryIds = new Set(props.draft.categories.map((item) => item.category_id));
  const mainCategoryId = props.draft.categories.find((item) => item.main_category)?.category_id ?? null;
  const filteredCategoryTree = filterCategoryTree(categoryTree, categoryQuery, selectedCategoryIds, onlyCheckedCategories);

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
    props.onChange({
      jv_fields: {
        ...(props.draft.jv_fields ?? {}),
        lieferzeitid: value
      }
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
    props.onChange({
      categories: [...props.draft.categories, { category_id: categoryId, main_category: props.draft.categories.length === 0 }]
    });
  }

  function removeCategory(categoryId: number) {
    const next = props.draft.categories.filter((item) => item.category_id !== categoryId);
    const hasMain = next.some((item) => item.main_category);
    props.onChange({
      categories: hasMain ? next : next.map((item, index) => ({ ...item, main_category: index === 0 }))
    });
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

  function resolveUploadSite(): "JV" | "XL" {
    if ((props.activeTabLabel ?? "").toUpperCase().includes("XL")) return "XL";
    const rawSite = String(props.draft.jv_fields?.site ?? "").toUpperCase();
    return rawSite === "XL" ? "XL" : "JV";
  }

  function resolveUploadSiteKey(site: "JV" | "XL"): string {
    const fieldSiteKey = String(props.draft.jv_fields?.site_key ?? "").trim();
    if (fieldSiteKey) return fieldSiteKey;
    return site === "XL" ? "XLMOEBEL_DE" : "JV_DE";
  }

  async function sleep(ms: number) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  async function uploadWithRetry(input: {
    files: File[];
    site: "JV" | "XL";
    siteKey: string;
    imageRole: "main" | "additional";
  }) {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS_PER_SITE; attempt += 1) {
      try {
        setUploadProgress((prev) => ({
          ...prev,
          label: `Uploading ${input.imageRole} (${input.siteKey}) attempt ${attempt}/${UPLOAD_MAX_ATTEMPTS_PER_SITE}...`
        }));
        return await uploadProductEditorImages({
          files: input.files,
          site: input.site,
          siteKey: input.siteKey,
          ean: props.draft.ean,
          imageRole: input.imageRole
        });
      } catch (error) {
        lastError = error;
        if (attempt < UPLOAD_MAX_ATTEMPTS_PER_SITE) {
          await sleep(UPLOAD_RETRY_DELAY_MS);
        }
      }
    }
    throw lastError ?? new Error(`Upload failed for site key ${input.siteKey}`);
  }

  async function uploadImagesForAllSites(input: {
    files: File[];
    site: "JV" | "XL";
    fallbackSiteKey: string;
    imageRole: "main" | "additional";
  }) {
    if (input.site === "JV") {
      const responsesBySiteKey = new Map<string, Awaited<ReturnType<typeof uploadProductEditorImages>>>();
      setUploadProgress({
        active: true,
        label: `Uploading ${input.imageRole} image${input.files.length > 1 ? "s" : ""} to JV sites...`,
        percent: 0
      });
      for (let index = 0; index < JV_SITE_KEYS.length; index += 1) {
        const siteKey = JV_SITE_KEYS[index];
        const response = await uploadWithRetry({
          files: input.files,
          site: "JV",
          siteKey,
          imageRole: input.imageRole
        });
        responsesBySiteKey.set(siteKey, response);
        setUploadProgress((prev) => ({
          ...prev,
          percent: Math.round(((index + 1) / JV_SITE_KEYS.length) * 100)
        }));
      }
      setUploadProgress({ active: false, label: "", percent: 0 });
      const preferred = responsesBySiteKey.get("JV_DE") ?? responsesBySiteKey.values().next().value;
      if (!preferred) {
        throw new Error("Upload failed for JV sites.");
      }
      return preferred;
    }

    setUploadProgress({
      active: true,
      label: `Uploading ${input.imageRole} image${input.files.length > 1 ? "s" : ""}...`,
      percent: 20
    });
    const response = await uploadWithRetry({
      files: input.files,
      site: input.site,
      siteKey: input.fallbackSiteKey,
      imageRole: input.imageRole
    });
    setUploadProgress({ active: false, label: "", percent: 0 });
    return response;
  }

  function markUploading(urls: string[]) {
    if (urls.length === 0) return;
    setUploadingImageUrls((prev) => {
      const next = new Set(prev);
      for (const url of urls) next.add(url);
      return next;
    });
  }

  function unmarkUploading(urls: string[]) {
    if (urls.length === 0) return;
    setUploadingImageUrls((prev) => {
      const next = new Set(prev);
      for (const url of urls) next.delete(url);
      return next;
    });
  }

  function replaceImageUrlsInDraft(oldToNew: Map<string, string>) {
    if (oldToNew.size === 0) return;
    const currentDraft = latestDraftRef.current;
    const nextMain = oldToNew.get(currentDraft.image) ?? currentDraft.image;
    const nextImages = currentDraft.images.map((row) => ({
      ...row,
      image: oldToNew.get(row.image) ?? row.image
    }));
    props.onChange({ image: nextMain, images: nextImages });
    const selectedCurrent = selectedImageUrlRef.current;
    if (selectedCurrent) {
      setSelectedImageUrl(oldToNew.get(selectedCurrent) ?? selectedCurrent);
    }
  }

  async function handlePickMainImage(event: React.ChangeEvent<HTMLInputElement>) {
    const inputElement = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;
    const tempUrl = createObjectUrl(file);
    props.onChange({ image: tempUrl });
    setSelectedImageUrl(tempUrl);
    markUploading([tempUrl]);
    const site = resolveUploadSite();
    const siteKey = resolveUploadSiteKey(site);
    try {
      const response = await uploadImagesForAllSites({
        files: [file],
        site,
        fallbackSiteKey: siteKey,
        imageRole: "main"
      });
      const uploadedMain = String(response.image ?? response.uploaded_image_urls?.[0] ?? "").trim();
      if (uploadedMain) {
        const replaceMap = new Map<string, string>([[tempUrl, uploadedMain]]);
        replaceImageUrlsInDraft(replaceMap);
      }
    } catch {
      // keep local preview URL on failure; user can retry upload.
      setUploadProgress({ active: false, label: "", percent: 0 });
    } finally {
      unmarkUploading([tempUrl]);
    }
    inputElement.value = "";
  }

  async function handlePickAdditionalImages(event: React.ChangeEvent<HTMLInputElement>) {
    const inputElement = event.currentTarget;
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const tempUrls: string[] = [];
    const nextImages = [...props.draft.images];
    for (const file of fileList) {
      const tempUrl = createObjectUrl(file);
      tempUrls.push(tempUrl);
      nextImages.push({
        image: tempUrl,
        sort_order: nextImages.length
      });
    }
    props.onChange({ images: nextImages });
    markUploading(tempUrls);
    const site = resolveUploadSite();
    const siteKey = resolveUploadSiteKey(site);
    try {
      const response = await uploadImagesForAllSites({
        files: fileList,
        site,
        fallbackSiteKey: siteKey,
        imageRole: "additional"
      });
      const uploadedUrls = Array.isArray(response.uploaded_image_urls) ? response.uploaded_image_urls.map((value) => String(value)) : [];
      const replaceMap = new Map<string, string>();
      for (let index = 0; index < tempUrls.length; index += 1) {
        const uploaded = String(uploadedUrls[index] ?? "").trim();
        if (uploaded) replaceMap.set(tempUrls[index], uploaded);
      }
      replaceImageUrlsInDraft(replaceMap);
    } catch {
      // keep local preview URLs on failure; user can retry upload.
      setUploadProgress({ active: false, label: "", percent: 0 });
    } finally {
      unmarkUploading(tempUrls);
    }
    inputElement.value = "";
  }

  function moveGalleryImage(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const items = [...galleryImages];
    const [moved] = items.splice(fromIndex, 1);
    if (!moved) return;
    items.splice(toIndex, 0, moved);

    const [nextMain, ...nextAdditional] = items;
    props.onChange({
      image: nextMain ?? "",
      images: nextAdditional.map((image, index) => ({ image, sort_order: index }))
    });
    setSelectedImageUrl(moved);
  }

  function removeGalleryImage(index: number) {
    if (index < 0 || index >= galleryImages.length) return;
    const next = galleryImages.filter((_, idx) => idx !== index);
    const [nextMain, ...nextAdditional] = next;
    props.onChange({
      image: nextMain ?? "",
      images: nextAdditional.map((image, idx) => ({ image, sort_order: idx }))
    });
    if (selectedImageUrl === galleryImages[index]) {
      setSelectedImageUrl(nextMain ?? nextAdditional[0] ?? "");
    }
  }

  function setMainCategory(categoryId: number) {
    props.onChange({
      categories: props.draft.categories.map((item) => ({ ...item, main_category: item.category_id === categoryId }))
    });
  }

  function toggleCategoryExpand(categoryId: number) {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

  return (
    <ProductEditorPanelLayout
      kicker={props.draft.ean ? `EAN ${props.draft.ean}` : "EAN -"}
      title={props.draft.ean ? `EAN: ${props.draft.ean}` : "EAN: -"}
      changedCount={changedFields.length}
      status={props.draft.target_id || undefined}
      headerActions={
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-xl text-xs font-semibold"
          onClick={props.onApplyEditedProducts}
          disabled={Boolean(props.batchApplyLoading) || changedFields.length === 0}
        >
          {props.batchApplyLoading ? "Updating..." : "Update Edited Products"}
        </Button>
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
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">delivery</p>
              <select
                value={deliveryIdValue}
                onChange={(event) => patchDeliveryId(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xl font-semibold text-foreground">Product Gallery</p>
                <p className="text-sm text-muted-foreground">Manage product images, delete old images, upload new product photos.</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-emerald-300/70 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                {galleryImages.length} images
              </span>
            </div>

          {displayImageUrl ? (
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-muted/30">
              <ProductEditorPreviewImage src={displayImageUrl} className={cn("object-cover", uploadingImageUrls.has(displayImageUrl) ? "grayscale opacity-60" : null)} />
              {displayImageUrl === mainImageUrl ? (
                <span className="absolute left-2 top-2 z-10 inline-flex items-center rounded-full border border-emerald-300 bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-white">
                  Main
                </span>
              ) : null}
            </div>
          ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
                No product images loaded
              </div>
            )}

            {galleryImages.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {galleryImages.map((url, index) => (
                  <div
                  key={`${url}-${index}`}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={() => {
                    setDraggedImageIndex(index);
                    setDragOverImageIndex(index);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverImageIndex(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedImageIndex !== null) {
                      moveGalleryImage(draggedImageIndex, index);
                    }
                    setDraggedImageIndex(null);
                    setDragOverImageIndex(null);
                  }}
                  onDragEnd={() => {
                    setDraggedImageIndex(null);
                    setDragOverImageIndex(null);
                  }}
                  onClick={() => setSelectedImageUrl(url)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedImageUrl(url);
                    }
                  }}
                  className={cn(
                    "relative h-20 w-32 overflow-hidden rounded-xl border bg-muted/30 transition",
                    url === displayImageUrl ? "border-emerald-500 ring-1 ring-emerald-500/40" : "border-border hover:border-emerald-400/60",
                    dragOverImageIndex === index && draggedImageIndex !== index ? "ring-2 ring-emerald-400/80" : null,
                    draggedImageIndex === index ? "opacity-60" : null
                  )}
                >
                  <ProductEditorPreviewImage src={url} className={cn("object-cover", uploadingImageUrls.has(url) ? "grayscale opacity-60" : null)} />
                  {url === mainImageUrl ? (
                    <span className="absolute left-1 top-1 z-10 inline-flex items-center rounded-full border border-emerald-300 bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-white">
                      Main
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeGalleryImage(index);
                    }}
                    className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-red-500/90 text-sm font-bold leading-none text-white shadow-sm transition hover:scale-105 hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    aria-label="Remove image"
                    title="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            ) : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                className="h-11 rounded-xl text-sm font-semibold"
                onClick={() => mainImageInputRef.current?.click()}
              >
                Upload main image
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-11 rounded-xl text-sm font-semibold"
                onClick={() => additionalImagesInputRef.current?.click()}
              >
                Add additional images
              </Button>
            </div>
            {uploadProgress.active ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                    {uploadProgress.label}
                  </span>
                  <span className="text-xs font-semibold text-emerald-700">{uploadProgress.percent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${Math.max(2, Math.min(100, uploadProgress.percent))}%` }}
                  />
                </div>
              </div>
            ) : null}
            <input ref={mainImageInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickMainImage} />
            <input ref={additionalImagesInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePickAdditionalImages} />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Category</p>
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Selected: {props.draft.categories.length}
              </span>
            </div>
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

type CategoryTreeRowProps = {
  node: ProductEditorJvRubricNode;
  level: number;
  expandedCategoryIds: Set<number>;
  selectedCategoryIds: Set<number>;
  mainCategoryId: number | null;
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
          className="w-4 text-center text-muted-foreground"
        >
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
            name="jv-main-category"
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
              onToggleExpand={props.onToggleExpand}
              onToggleSelect={props.onToggleSelect}
              onSetMainCategory={props.onSetMainCategory}
            />
          ))
        : null}
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

function normalizeJvImageUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("cosmoshop/")) return `https://jvmoebel.de/${raw}`;
  if (raw.startsWith("/")) return `https://jvmoebel.de${raw}`;
  return `https://jvmoebel.de/${raw}`;
}

function getAdditionalImageUrls(draft: ProductEditorJvDraft, mainImageUrl: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  if (mainImageUrl) {
    seen.add(mainImageUrl.toLowerCase());
  }
  for (const row of draft.images) {
    const normalized = normalizeJvImageUrl(row.image);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
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

function normalizeDescriptionHtmlForPreview(html: string): string {
  const value = String(html || "");
  if (!value) return "";
  return value
    .replace(/%HOST%/gi, "https://www.jvmoebel.de")
    .replace(/src=(['"])\/cosmoshop\//gi, 'src=$1https://www.jvmoebel.de/cosmoshop/')
    .replace(/href=(['"])\/cosmoshop\//gi, 'href=$1https://www.jvmoebel.de/cosmoshop/')
    .replace(/href=(['"])\/Infos\//gi, 'href=$1https://www.jvmoebel.de/Infos/');
}
