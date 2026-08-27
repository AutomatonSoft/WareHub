"use client";

import { useEffect, useMemo, useState } from "react";

import {
  OttoCreateProductPanel,
  type OttoCreateProductDraft,
} from "../../app/create-product/otto-create-product-panel";
import {
  CreateProductImageGallery,
  type CreateProductGalleryItem,
} from "../../app/create-product/create-product-image-gallery";
import { OttoCategoriesPanel } from "../../app/create-product/otto-categories-panel";
import type { ProductEditorOttoDraft, ProductEditorWarning } from "./product-editor-types";

type Props = {
  draft: ProductEditorOttoDraft;
  warnings: ProductEditorWarning[];
  loading: boolean;
  applyLoading: boolean;
  changedFields: string[];
  onChange: (patch: Partial<ProductEditorOttoDraft>) => void;
  onApply: () => void;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(textValue) : [];
}

function imageUrls(mediaAssets: Array<Record<string, unknown>>): string[] {
  const seen = new Set<string>();
  return mediaAssets.flatMap((asset) => {
    const url = textValue(asset.location ?? asset.url ?? asset.imageUrl ?? asset.image_url).trim();
    const key = url.toLowerCase();
    if (!url || seen.has(key)) return [];
    seen.add(key);
    return [url];
  });
}

function hasPublicImageUrl(asset: Record<string, unknown>): boolean {
  return Boolean(textValue(asset.location ?? asset.url ?? asset.imageUrl ?? asset.image_url).trim());
}

function filenameFromUrl(location: string): string {
  return location.split("/").pop() || "image";
}

function productAttributes(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((attribute): attribute is Record<string, unknown> => Boolean(attribute) && typeof attribute === "object" && !Array.isArray(attribute))
    : [];
}

function attributeId(attribute: Record<string, unknown>, index: number): string {
  return textValue(attribute.attributeId ?? attribute.attributeKey ?? attribute.id).trim() || String(index);
}

function attributeValues(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toCreateDraft(draft: ProductEditorOttoDraft): OttoCreateProductDraft {
  const description = draft.productDescription;
  const attributes = productAttributes(description.attributes);

  return {
    productReference: draft.productReference,
    sku: draft.sku,
    ean: draft.ean,
    quantity: "1",
    price: textValue(asRecord(draft.pricing.standardPrice).amount),
    deliveryTime: textValue(draft.delivery.deliveryTime),
    shippingProfileId: draft.shippingProfileId,
    category: textValue(description.category),
    productLine: textValue(description.productLine ?? description.title),
    description: textValue(description.description ?? description.text),
    bulletPoints: textList(description.bulletPoints),
    additionalAttributes: {},
    attributeOverrides: Object.fromEntries(
      attributes.map((attribute, index) => [attributeId(attribute, index), textList(attribute.values).join(", ")]),
    ),
    attributeNames: Object.fromEntries(
      attributes.map((attribute, index) => [attributeId(attribute, index), textValue(attribute.name ?? attribute.label ?? attribute.attributeKey)]),
    ),
    removedAttributeIds: [],
  };
}

function toEditorAttributes(source: Array<Record<string, unknown>>, draft: OttoCreateProductDraft): Array<Record<string, unknown>> {
  const selectedAttributes = source
    .map((attribute, index) => ({ attribute, id: attributeId(attribute, index) }))
    .filter(({ id }) => !draft.removedAttributeIds.includes(id))
    .map(({ attribute, id }) => {
      const override = draft.attributeOverrides[id];
      return override === undefined ? attribute : { ...attribute, values: attributeValues(override) };
    });

  const sourceIds = new Set(source.map(attributeId));
  const addedAttributes = Object.entries(draft.additionalAttributes)
    .filter(([id]) => !sourceIds.has(id))
    .map(([id, value]) => ({ attributeId: id, name: draft.attributeNames[id] ?? id, values: attributeValues(value), additional: true }));

  return [...selectedAttributes, ...addedAttributes];
}

export function ProductEditorOttoPanel(props: Props) {
  const description = props.draft.productDescription;
  const sourceAttributes = productAttributes(description.attributes);
  const [activeGalleryItemId, setActiveGalleryItemId] = useState("");
  const [failedImageItemIds, setFailedImageItemIds] = useState<Set<string>>(() => new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState(() => textValue(description.categoryId));
  const initialCreateDraft = useMemo(() => toCreateDraft(props.draft), [props.draft]);
  const categoryId = textValue(description.categoryId);

  useEffect(() => {
    setSelectedCategoryId(categoryId);
  }, [categoryId]);

  useEffect(() => {
    setFailedImageItemIds(new Set());
  }, [props.draft.mediaAssets]);

  const availableGalleryItems = useMemo<CreateProductGalleryItem[]>(() => (
    imageUrls(props.draft.mediaAssets).map((src, index) => ({
      id: `${index}:${src}`,
      src,
      sourcePath: src,
      isLocal: false,
    }))
  ), [props.draft.mediaAssets]);
  const galleryItems = availableGalleryItems.filter((item) => !failedImageItemIds.has(item.id));
  const missingLocationImageCount = props.draft.mediaAssets.filter(
    (asset) => textValue(asset.type).toUpperCase() === "IMAGE" && !hasPublicImageUrl(asset),
  ).length;

  const applyCreateDraft = (next: OttoCreateProductDraft) => {
    const price = Number(next.price);
    const deliveryTime = Number(next.deliveryTime);

    props.onChange({
      productReference: next.productReference,
      sku: next.sku,
      ean: next.ean,
      shippingProfileId: next.shippingProfileId,
      pricing: Number.isFinite(price)
        ? { ...props.draft.pricing, standardPrice: { ...asRecord(props.draft.pricing.standardPrice), amount: price } }
        : props.draft.pricing,
      delivery: {
        ...props.draft.delivery,
        type: textValue(props.draft.delivery.type).trim() || "PARCEL",
        deliveryTime: Number.isFinite(deliveryTime) ? deliveryTime : next.deliveryTime,
      },
      productDescription: {
        ...description,
        category: next.category,
        productLine: next.productLine,
        description: next.description,
        bulletPoints: next.bulletPoints,
        attributes: toEditorAttributes(sourceAttributes, next),
      },
    });
  };

  const updateGalleryItems = (nextItems: CreateProductGalleryItem[]) => {
    props.onChange({
      mediaAssets: nextItems.map((item) => ({ type: "IMAGE", location: item.src, filename: filenameFromUrl(item.src) })),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">
            <OttoCreateProductPanel
              initialDraft={initialCreateDraft}
              draftKey={`${props.draft.target_id}:${props.draft.profile}`}
              showQuantity={false}
              profile={props.draft.profile}
              categoryId={selectedCategoryId}
              categoryName={textValue(description.category)}
              productAttributes={sourceAttributes}
              onDraftChange={applyCreateDraft}
            />
          </div>
          <div className="flex w-full flex-col gap-3 xl:ml-auto xl:w-[520px] xl:flex-none">
            <CreateProductImageGallery
              items={galleryItems}
              activeItemId={activeGalleryItemId}
              previewAlt="OTTO product image preview"
              emptyPreviewLabel="No image selected"
              emptyGalleryLabel="No images in gallery"
              thumbnailAlt={(index) => `OTTO product image ${index + 1}`}
              deleteAlt={(index) => `Delete OTTO product image ${index + 1}`}
              onActiveItemChange={setActiveGalleryItemId}
              onImageError={(itemId) => {
                setFailedImageItemIds((current) => new Set(current).add(itemId));
                if (activeGalleryItemId === itemId) setActiveGalleryItemId("");
              }}
              onDeleteItem={(itemId) => {
                const nextItems = galleryItems.filter((item) => item.id !== itemId);
                updateGalleryItems(nextItems);
                if (activeGalleryItemId === itemId) setActiveGalleryItemId(nextItems[0]?.id ?? "");
              }}
              onMoveItem={(sourceItemId, targetItemId) => {
                const sourceIndex = galleryItems.findIndex((item) => item.id === sourceItemId);
                const targetIndex = galleryItems.findIndex((item) => item.id === targetItemId);
                if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
                const nextItems = [...galleryItems];
                const [movedItem] = nextItems.splice(sourceIndex, 1);
                nextItems.splice(targetIndex, 0, movedItem);
                updateGalleryItems(nextItems);
              }}
            />
            {missingLocationImageCount > 0 || failedImageItemIds.size > 0 ? (
              <p className="rounded-[var(--radius-control)] border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {missingLocationImageCount > 0
                  ? "Some OTTO images have only a filename. A public image URL was not returned, so they cannot be previewed."
                  : "Some OTTO image URLs are unavailable, so they cannot be previewed."}
              </p>
            ) : null}
            <OttoCategoriesPanel
              selectedCategoryId={selectedCategoryId}
              selectedCategoryName={textValue(description.category)}
              onSelectedCategoryChange={(category) => {
                setSelectedCategoryId(category.id);
                const { categoryId: _categoryId, ...descriptionWithoutCategoryId } = description;
                props.onChange({ productDescription: { ...descriptionWithoutCategoryId, category: category.name } });
              }}
            />
          </div>
        </div>
      </div>

      {props.warnings.map((warning) => <p key={warning.code} className="text-sm text-amber-700">{warning.message}</p>)}
    </div>
  );
}
