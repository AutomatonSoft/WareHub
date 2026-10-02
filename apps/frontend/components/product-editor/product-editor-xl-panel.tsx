"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useLabels } from "../../app/use-labels";
import { JvDescriptionEditor } from "../../app/create-product/jv-description-editor";
import { ProductEditorAttributesEditor, ProductEditorPanelLayout } from "./product-editor-shared-panels";
import { buildJvChangedFields, normalizeProductAttributes, sanitizeDescriptionPreviewHtml } from "./product-editor-model";
import { FormField } from "../ui/form-field";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { CreateProductImageGallery, XlCreateProductPanel, JvPublishingOptionsPanel, type JvPublishingSelections, type XlCreateProductDraft } from "../product-forms";
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

const XL_IMAGE_HOSTS: Record<string, string> = { XLMOEBEL_DE: "https://xlmoebel.de", XLMOEBEL_CH: "https://xlmoebel.ch", XLMOEBEL_AT: "https://xlmoebel.at" };

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


  const descriptions = props.draft.descriptions;
  const stores = props.draft.stores;
  const specials = props.draft.specials;
  const pendingUploadCount = props.draft.pending_uploads.length;
  const mainImageValue = galleryState.mainImage.preview || props.draft.image_public_url || props.draft.image;
  const firstDescription = descriptions[0];
  const descriptionValue = firstDescription?.description ?? "";
  const descriptionPreviewHtml = useMemo(() => sanitizeDescriptionPreviewHtml(descriptionValue), [descriptionValue]);
  const changedCount = buildJvChangedFields(props.initialDraft, props.draft).length;
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
        <p className="text-sm text-muted-foreground">Price currency: {props.draft.target_id === "XLMOEBEL_CH" ? "CHF" : "EUR"}. Prices are converted on the server for XL DE/AT (EUR) and XL CH (CHF).</p>
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
          <ProductEditorXlPublishingOptions key={`${props.draft.target_id}:${props.draft.ean}`} draft={props.draft} onChange={props.onChange} />
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
                  </div>

                  <JvDescriptionEditor
                    description={descriptionValue}
                    previewHtml={descriptionPreviewHtml}
                    mode={descriptionMode}
                    descriptionLabel={t.descriptionLabel}
                    codeLabel={t.codeLabel}
                    previewLabel={t.previewLabel}
                    onModeChange={setDescriptionMode}
                    onChange={(value) => patchDescription(0, "description", value)}
                  />
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
    manufacturer_id: String(draft.manufacturer_id ?? ""),
    description: firstDescription?.description ?? "",
    tag: firstDescription?.tag ?? "",
    meta_title: firstDescription?.meta_title ?? "",
    meta_description: firstDescription?.meta_description ?? "",
    meta_keyword: firstDescription?.meta_keyword ?? "",
  };
  return <XlCreateProductPanel showManufacturer={false} initialFields={initialFields} draftKey={`${draft.target_id}:${draft.ean}`} codeLabel={t.codeLabel} previewLabel={t.previewLabel} onDraftChange={(next) => onChange({
    ean: next.ean,
    price: next.price,
    descriptions: [{ ...(firstDescription ?? { language_id: 1 }), name: next.name, description: next.description, tag: next.tag, meta_title: next.meta_title, meta_description: next.meta_description, meta_keyword: next.meta_keyword }, ...draft.descriptions.slice(1)],
  })} />;
}

function ProductEditorXlPublishingOptions({ draft, onChange }: { draft: ProductEditorJvDraft; onChange: (patch: Partial<ProductEditorJvDraft>) => void }) {
  const [sourceCategories] = useState(() => draft.categories.map((row) => ({ category_id: row.category_id, main_category: Boolean(row.main_category) })));
  const [initialSelections] = useState<JvPublishingSelections>(() => ({
    rubricIdsBySite: Object.fromEntries(Object.entries(draft.categories_by_site_key).map(([key, rows]) => [key, rows.map((row) => row.category_id)])),
    mainRubricIdBySite: Object.fromEntries(Object.entries(draft.categories_by_site_key).map(([key, rows]) => [key, rows.find((row) => row.main_category)?.category_id ?? null])),
    deliveryIdsBySite: Object.fromEntries(Object.entries(draft.manufacturer_id_by_site_key ?? {}).map(([key, id]) => [key, [id]])),
  }));
  return <JvPublishingOptionsPanel
    family="XL"
    sourceSiteKey={draft.target_id}
    sourceCategories={sourceCategories}
    sourceDeliveryId={draft.manufacturer_id}
    initialSelections={initialSelections}
    initialSelectionKey={`${draft.target_id}:${draft.ean}`}
    onSelectionsChange={(selections) => {
      const categories = Object.fromEntries(Object.entries(selections.rubricIdsBySite).map(([key, ids]) => [key, ids.map((category_id) => ({ category_id, main_category: category_id === (selections.mainRubricIdBySite[key as keyof typeof selections.mainRubricIdBySite] ?? ids[0]) }))]));
      const manufacturers = Object.fromEntries(Object.entries(selections.deliveryIdsBySite).filter(([, ids]) => ids.length === 1).map(([key, ids]) => [key, ids[0]]));
      onChange({
        categories_by_site_key: categories,
        categories: categories[draft.target_id] ?? draft.categories,
        manufacturer_id_by_site_key: manufacturers,
        manufacturer_id: manufacturers[draft.target_id] ?? draft.manufacturer_id,
      });
    }}
  />;
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

function normalizeXlImageUrl(value: string, siteKey: string): string {
  const host = XL_IMAGE_HOSTS[siteKey] ?? XL_IMAGE_HOSTS.XLMOEBEL_DE;
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("/image/")) return `${host}${raw}`;
  if (raw.startsWith("image/")) return `${host}/${raw}`;
  if (raw.startsWith("/")) return `${host}${raw}`;
  return `${host}/image/${raw}`;
}

function buildXlGalleryState(draft: ProductEditorJvDraft): { mainImage: XlGalleryImage; allImages: XlGalleryImage[] } {
  const seen = new Set<string>();
  const allImages: XlGalleryImage[] = [];

  const pushImage = (rawValue: string, publicUrl?: string) => {
    const preview = normalizeXlImageUrl(publicUrl || rawValue, draft.target_id);
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
