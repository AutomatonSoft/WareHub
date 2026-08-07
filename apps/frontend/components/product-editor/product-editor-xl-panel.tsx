"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useLabels } from "../../app/use-labels";
import { getXlRubricTree, type ProductEditorJvRubricNode } from "./product-editor-api";
import { ProductEditorAttributesEditor, ProductEditorPanelLayout } from "./product-editor-shared-panels";
import { normalizeProductAttributes, sanitizeDescriptionPreviewHtml } from "./product-editor-model";
import { Button } from "../ui/button";
import { FormField } from "../ui/form-field";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/cn";
import { CreateProductImageGallery, XlCreateProductPanel, type XlCreateProductDraft } from "../product-forms";
import type { ProductEditorJobResponse, ProductEditorJvDraft, ProductEditorPendingUpload, ProductEditorWarning } from "./product-editor-types";

type ProductEditorXlPanelProps = {
  draft: ProductEditorJvDraft;
  initialDraft: ProductEditorJvDraft;
  loading: boolean;
  warnings: ProductEditorWarning[];
  onChange: (patch: Partial<ProductEditorJvDraft>) => void;
  batchApplyLoading?: boolean;
  jobResponse?: ProductEditorJobResponse | null;
  onApplyEditedProducts?: () => void;
  eanValue: string;
  isEanValid: boolean;
  searching: boolean;
  onChangeEan: (value: string) => void;
  onSearch: () => void;
};

const XL_IMAGE_HOST = "https://xlmoebel.de";
const XL_SITE_KEY = "XLMOEBEL_DE";

export function ProductEditorXlPanel(props: ProductEditorXlPanelProps) {
  const t = useLabels();
  const createdObjectUrlsRef = useRef<string[]>([]);
  const latestDraftRef = useRef(props.draft);
  const galleryState = useMemo(() => buildXlGalleryState(props.draft), [props.draft]);
  const galleryItems = galleryState.allImages.map((item, index) => ({
    id: `${index}:${item.preview}`,
    src: item.preview,
    uploading: false,
  }));
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(galleryItems[0]?.src ?? "");
  const [categoryTree, setCategoryTree] = useState<ProductEditorJvRubricNode[]>([]);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<number>>(new Set());
  const [categoryQuery, setCategoryQuery] = useState("");
  const [onlyCheckedCategories, setOnlyCheckedCategories] = useState(false);
  const [descriptionMode, setDescriptionMode] = useState<"code" | "preview">("preview");

  useEffect(() => {
    latestDraftRef.current = props.draft;
  }, [props.draft]);

  useEffect(() => {
    setSelectedImageUrl((current) => {
      if (galleryItems.some((item) => item.src === current)) {
        return current;
      }
      return galleryItems[0]?.src ?? "";
    });
  }, [galleryItems]);

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
        const tree = await getXlRubricTree(XL_SITE_KEY);
        if (!mounted) return;
        setCategoryTree(tree);
        setExpandedCategoryIds(collectAllCategoryIds(tree));
      } catch {
        if (!mounted) return;
        setCategoryTree([]);
        setExpandedCategoryIds(new Set());
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const descriptions = props.draft.descriptions;
  const stores = props.draft.stores;
  const specials = props.draft.specials;
  const categories = props.draft.categories;
  const selectedCategoryIds = new Set(categories.map((item) => item.category_id));
  const mainCategoryId = categories.find((item) => item.main_category)?.category_id ?? null;
  const pendingUploadCount = props.draft.pending_uploads.length;
  const mainImageValue = galleryState.mainImage.preview || props.draft.image_public_url || props.draft.image;
  const firstDescription = descriptions[0];
  const descriptionValue = firstDescription?.description ?? "";
  const descriptionPreviewHtml = useMemo(() => sanitizeDescriptionPreviewHtml(descriptionValue), [descriptionValue]);
  const changedCount = countChangedFields(props.initialDraft, props.draft);
  const xlOptionFields = useMemo(() => normalizeProductAttributes(props.draft.xl_option_fields), [props.draft.xl_option_fields]);
  const xlAttributeFields = useMemo(() => normalizeProductAttributes(props.draft.xl_attribute_fields), [props.draft.xl_attribute_fields]);

  function patchScalar<K extends "price" | "quantity" | "image" | "image_public_url">(key: K, value: ProductEditorJvDraft[K]) {
    props.onChange({ [key]: value } as Pick<ProductEditorJvDraft, K>);
  }

  function patchStatus(value: boolean) {
    props.onChange({ status: value });
  }

  function patchDescription(index: number, field: string, value: string) {
    const nextDescriptions = props.draft.descriptions.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    ));
    props.onChange({ descriptions: nextDescriptions });
  }

  function patchCategories(nextCategories: ProductEditorJvDraft["categories"]) {
    const normalized = normalizeCategorySelection(nextCategories);
    props.onChange({
      categories: normalized,
      categories_by_site_key: {
        ...props.draft.categories_by_site_key,
        [XL_SITE_KEY]: normalized,
      },
    });
  }

  function addCategory(categoryId: number) {
    if (selectedCategoryIds.has(categoryId)) return;
    patchCategories([...categories, { category_id: categoryId, main_category: categories.length === 0 }]);
  }

  function removeCategory(categoryId: number) {
    const next = categories.filter((item) => item.category_id !== categoryId);
    const hasMain = next.some((item) => item.main_category);
    patchCategories(hasMain ? next : next.map((item, index) => ({ ...item, main_category: index === 0 })));
  }

  function toggleCategory(categoryId: number, checked: boolean) {
    if (checked) {
      addCategory(categoryId);
      return;
    }
    removeCategory(categoryId);
  }

  function setMainCategory(categoryId: number) {
    patchCategories(categories.map((item) => ({ ...item, main_category: item.category_id === categoryId })));
  }

  function toggleCategoryExpand(categoryId: number) {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
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
    const currentGalleryState = buildXlGalleryState(draft);
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
        sort_order: nextImages.length,
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
      pending_uploads: dedupePendingUploads(nextPendingUploads),
    });
  }

  function moveGalleryImage(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const items = [...galleryState.allImages];
    const [moved] = items.splice(fromIndex, 1);
    if (!moved) return;
    items.splice(toIndex, 0, moved);

    const [nextMain, ...nextAdditional] = items;
    props.onChange({
      image: nextMain?.raw ?? "",
      image_public_url: nextMain?.preview ?? "",
      images: nextAdditional.map((image, index) => ({ image: image.raw, public_url: image.preview, sort_order: index })),
    });
    setSelectedImageUrl(moved.preview);
  }

  function removeGalleryImage(index: number) {
    if (index < 0 || index >= galleryState.allImages.length) return;
    const removedImage = galleryState.allImages[index]?.preview ?? "";
    const next = galleryState.allImages.filter((_, idx) => idx !== index);
    const [nextMain, ...nextAdditional] = next;
    props.onChange({
      image: nextMain?.raw ?? "",
      image_public_url: nextMain?.preview ?? "",
      images: nextAdditional.map((image, idx) => ({ image: image.raw, public_url: image.preview, sort_order: idx })),
      pending_uploads: props.draft.pending_uploads.filter((item) => item.preview_url !== removedImage),
    });
    revokeTrackedObjectUrl(removedImage);
  }

  return (
    <ProductEditorPanelLayout
      changedCount={changedCount}
      status={props.draft.target_id || undefined}
      headerActions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {pendingUploadCount > 0 ? <span className="text-xs text-muted-foreground">{t.productEditorImagesPending.replace("{count}", String(pendingUploadCount))}</span> : null}
        </div>
      }
      topLeft={<>
        <ProductEditorXlCreateForm draft={props.draft} onChange={props.onChange} />
        <div className="hidden flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField label={t.sourceModel} value={props.draft.source_model || "-"} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.price}</p>
              <Input value={String(props.draft.price ?? "")} onChange={(event) => patchScalar("price", event.target.value)} className="h-11 rounded-xl border-border bg-white text-sm" />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.quantity}</p>
              <Input value={String(props.draft.quantity ?? "")} onChange={(event) => patchScalar("quantity", event.target.value)} className="h-11 rounded-xl border-border bg-white text-sm" />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-foreground">{t.activeLabel}</p>
              <p className="text-xs text-muted-foreground">{t.productEditorXlStatusHint}</p>
            </div>
            <Switch checked={Boolean(props.draft.status)} onChange={(event) => patchStatus(event.target.checked)} aria-label={t.productEditorXlStatusAria} />
          </label>

	          <section className="space-y-3 border-t border-border/70 pt-4">
	            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.productEditorXlPrimaryDescription}</div>
	            {firstDescription ? (
	              <div className="grid gap-3 sm:grid-cols-2">
	                <FormField label={t.productNameLabel} className="sm:col-span-2"><Input value={firstDescription.name} onChange={(event) => patchDescription(0, "name", event.target.value)} className="h-11 rounded-xl border-border bg-white text-sm" /></FormField>
	                <FormField label={t.metaTitleLabel}><Input value={firstDescription.meta_title ?? ""} onChange={(event) => patchDescription(0, "meta_title", event.target.value)} className="h-11 rounded-xl border-border bg-white text-sm" /></FormField>
	                <FormField label={t.metaDescriptionLabel}><Input value={firstDescription.meta_description ?? ""} onChange={(event) => patchDescription(0, "meta_description", event.target.value)} className="h-11 rounded-xl border-border bg-white text-sm" /></FormField>
	                <FormField label={t.metaKeywordLabel}><Textarea value={firstDescription.meta_keyword ?? ""} onChange={(event) => patchDescription(0, "meta_keyword", event.target.value)} className="min-h-20 rounded-xl border-border bg-white text-sm" /></FormField>
	                <FormField label={t.tagSku}><Textarea value={firstDescription.tag ?? ""} onChange={(event) => patchDescription(0, "tag", event.target.value)} className="min-h-16 rounded-xl border-border bg-white text-sm" /></FormField>
	              </div>
	            ) : (
	              <div className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">{t.productEditorXlNoDescriptionRows}</div>
	            )}
	          </section>

          <ProductEditorAttributesEditor
            title={t.productEditorXlSourceAttributesTitle}
            subtitle={t.productEditorXlSourceAttributesHint}
            attributes={xlAttributeFields}
            readOnly
            onChange={(attributes) => {
              props.onChange({ xl_attribute_fields: attributes.map((row) => ({ key: row.key, label: row.label, name: row.label, value: row.value })) });
            }}
            emptyText={t.productEditorXlNoAttributeFields}
          />
        </div>
      </>}
      topRight={
        <div className="space-y-4">
          <CreateProductImageGallery
            items={galleryItems.map((item) => ({ ...item, isLocal: false }))}
            activeItemId={galleryItems.find((item) => item.src === selectedImageUrl)?.id ?? galleryItems[0]?.id ?? ""}
            previewAlt={t.productEditorGalleryTitle}
            uploadLabel={t.productEditorUploadImagesAction}
            emptyPreviewLabel={t.productEditorNoImage}
            emptyGalleryLabel={t.productEditorNoGalleryImages}
            thumbnailAlt={(index) => t.productEditorImagesCount.replace("{count}", String(index + 1))}
            deleteAlt={(index) => t.productEditorRemoveImageAria.replace("{index}", String(index + 1))}
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
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.category}</p>
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {XL_SITE_KEY}: {categories.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={categoryQuery}
                onChange={(event) => setCategoryQuery(event.target.value)}
                placeholder={t.searchCategoryByNameOrId}
                className="h-10 rounded-xl border-border bg-white text-sm"
              />
              <Button
                type="button"
                variant={onlyCheckedCategories ? "default" : "outline"}
                className="h-10 shrink-0 rounded-xl px-3 text-xs font-semibold"
                onClick={() => setOnlyCheckedCategories((prev) => !prev)}
              >
                {t.onlyChecked}
              </Button>
            </div>
            <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-border bg-white">
              {filterCategoryTree(categoryTree, categoryQuery, selectedCategoryIds, onlyCheckedCategories).length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t.noCategoriesFound}</p>
              ) : (
                filterCategoryTree(categoryTree, categoryQuery, selectedCategoryIds, onlyCheckedCategories).map((node) => (
                  <CategoryTreeRow
                    key={node.id}
                    node={node}
                    level={0}
                    expandedCategoryIds={expandedCategoryIds}
                    selectedCategoryIds={selectedCategoryIds}
                    mainCategoryId={mainCategoryId}
                    radioName="xl-main-category"
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
	        <div className="grid gap-4 lg:grid-cols-3">
	          {firstDescription ? (
	            <div className="lg:col-span-3">
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.productEditorXlDescriptionTitle}</p>
                      <p className="text-sm text-muted-foreground">{t.productEditorXlDescriptionHint}</p>
                    </div>
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
                      onChange={(event) => patchDescription(0, "description", event.target.value)}
                      className="min-h-[32rem] rounded-xl border-border bg-white font-sans text-sm"
                    />
                  ) : (
                    <div className="max-h-[32rem] overflow-auto rounded-xl border border-border bg-white p-4">
                      {descriptionValue.trim() ? (
                        <div
                          className="text-sm leading-6 outline-none"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(event) => patchDescription(0, "description", event.currentTarget.innerHTML)}
                          dangerouslySetInnerHTML={{ __html: descriptionPreviewHtml }}
                        />
                      ) : (
                        <div
                          className="text-sm text-muted-foreground outline-none"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(event) => patchDescription(0, "description", event.currentTarget.innerHTML)}
                        >
                          {t.noDescription}
                        </div>
                      )}
                    </div>
                  )}
                </div>
	            </div>
	          ) : null}
	          <RelationCard
	            title={t.descriptions}
	            emptyLabel={t.productEditorXlNoDescriptionRows}
            rows={descriptions.map((row) => ({
              title: `Lang ${row.language_id}`,
              lines: [row.name || "-", row.meta_title || "-", row.meta_description || "-"],
            }))}
          />
	        </div>
	      }
      bottom={<></>}
    />
  );
}

function ProductEditorXlCreateForm({ draft, onChange }: { draft: ProductEditorJvDraft; onChange: (patch: Partial<ProductEditorJvDraft>) => void }) {
  const t = useLabels();
  const firstDescription = draft.descriptions[0];
  const initialFields: XlCreateProductDraft = {
    name: firstDescription?.name ?? "",
    seo_url: String(draft.jv_fields?.urlkey ?? ""),
    ean: draft.ean,
    price: draft.price,
    uvp: String(draft.jv_fields?.uvp ?? ""),
    manufacturer_id: String(draft.jv_fields?.manufacturer_id ?? ""),
    description: firstDescription?.description ?? "",
    tag: firstDescription?.tag ?? "",
    meta_title: firstDescription?.meta_title ?? "",
    meta_description: firstDescription?.meta_description ?? "",
    meta_keyword: firstDescription?.meta_keyword ?? "",
  };
  return <XlCreateProductPanel initialFields={initialFields} draftKey={`${draft.target_id}:${draft.ean}`} codeLabel={t.codeLabel} previewLabel={t.previewLabel} onDraftChange={(next) => onChange({
    ean: next.ean,
    price: next.price,
    jv_fields: { ...draft.jv_fields, urlkey: next.seo_url, uvp: next.uvp, manufacturer_id: next.manufacturer_id },
    descriptions: [{ ...(firstDescription ?? { language_id: 1 }), name: next.name, description: next.description, tag: next.tag, meta_title: next.meta_title, meta_description: next.meta_description, meta_keyword: next.meta_keyword }, ...draft.descriptions.slice(1)],
  })} />;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <Input value={value} readOnly disabled className="h-11 rounded-xl border-border bg-muted/40 text-sm text-muted-foreground" />
    </div>
  );
}

function RelationCard({
  title,
  rows,
  emptyLabel,
  className = "",
}: {
  title: string;
  rows: Array<{ title: string; lines: string[] }>;
  emptyLabel: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`.trim()}>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
      <div className="grid gap-2">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          rows.map((row) => (
            <div key={`${title}:${row.title}:${row.lines.join("|")}`} className="rounded-xl border border-border bg-white px-3 py-3">
              <div className="text-sm font-semibold text-foreground">{row.title}</div>
              {row.lines.length > 0 ? (
                <div className="mt-1 grid gap-1">
                  {row.lines.map((line) => (
                    <div key={line} className="text-xs text-muted-foreground">{line}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type XlGalleryImage = {
  raw: string;
  preview: string;
};

function normalizeXlImageUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("/image/")) return `${XL_IMAGE_HOST}${raw}`;
  if (raw.startsWith("image/")) return `${XL_IMAGE_HOST}/${raw}`;
  if (raw.startsWith("/")) return `${XL_IMAGE_HOST}${raw}`;
  if (raw.startsWith("catalog/") || raw.startsWith("cache/") || raw.startsWith("data/")) return `${XL_IMAGE_HOST}/image/${raw}`;
  return `${XL_IMAGE_HOST}/image/${raw}`;
}

function buildXlGalleryState(draft: ProductEditorJvDraft): { mainImage: XlGalleryImage; allImages: XlGalleryImage[] } {
  const seen = new Set<string>();
  const allImages: XlGalleryImage[] = [];

  const pushImage = (rawValue: string, publicUrl?: string) => {
    const preview = normalizeXlImageUrl(publicUrl || rawValue);
    if (!preview) return;
    const key = preview.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    allImages.push({ raw: String(rawValue || "").trim(), preview });
  };

  pushImage(draft.image, draft.image_public_url);
  for (const row of draft.images) {
    pushImage(row.image, row.public_url);
  }

  return {
    mainImage: allImages[0] ?? { raw: "", preview: "" },
    allImages,
  };
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

function dedupePendingUploads(pendingUploads: ProductEditorPendingUpload[]): ProductEditorPendingUpload[] {
  const seen = new Set<string>();
  const result: ProductEditorPendingUpload[] = [];
  for (const item of pendingUploads) {
    const previewUrl = String(item.preview_url || "").trim();
    const signature = previewUrl || `${item.name}-${item.size}`;
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    result.push(item);
  }
  return result;
}

function countChangedFields(initial: ProductEditorJvDraft, current: ProductEditorJvDraft): number {
  let count = 0;
  if (JSON.stringify(initial.descriptions) !== JSON.stringify(current.descriptions)) count += 1;
  if (JSON.stringify(initial.categories) !== JSON.stringify(current.categories)) count += 1;
  if (JSON.stringify(initial.images) !== JSON.stringify(current.images)) count += 1;
  if (String(initial.image || "") !== String(current.image || "")) count += 1;
  if (String(initial.price || "") !== String(current.price || "")) count += 1;
  if (String(initial.quantity || "") !== String(current.quantity || "")) count += 1;
  if (Boolean(initial.status) !== Boolean(current.status)) count += 1;
  return count;
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

function normalizeCategorySelection(categories: ProductEditorJvDraft["categories"]): ProductEditorJvDraft["categories"] {
  const seen = new Set<number>();
  const normalized = categories
    .filter((item) => {
      const categoryId = Number(item.category_id);
      if (!Number.isFinite(categoryId) || categoryId <= 0 || seen.has(categoryId)) return false;
      seen.add(categoryId);
      return true;
    })
    .map((item) => ({ category_id: Number(item.category_id), main_category: Boolean(item.main_category) }));
  if (normalized.length === 0) return [];
  const mainCategoryId = normalized.find((item) => item.main_category)?.category_id ?? normalized[0].category_id;
  return normalized.map((item) => ({ ...item, main_category: item.category_id === mainCategoryId }));
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
    const children = node.children.map((child) => filterNode(child)).filter((row): row is ProductEditorJvRubricNode => Boolean(row));
    if (!ownMatch && children.length === 0) return null;
    return { ...node, children };
  };

  return nodes.map((node) => filterNode(node)).filter((row): row is ProductEditorJvRubricNode => Boolean(row));
}
