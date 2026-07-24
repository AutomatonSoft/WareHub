"use client";

import { useEffect, useState } from "react";
import { CreateProductImageGallery, KauflandProductDetailsPanel, KauflandProductFields, type KauflandCreateProductDraft } from "../product-forms";
import type { ProductEditorKauflandDraft, ProductEditorWarning } from "./product-editor-types";

type Props = {
  draft: ProductEditorKauflandDraft;
  warnings: ProductEditorWarning[];
  loading: boolean;
  applyLoading: boolean;
  changedFields: string[];
  onChange: (patch: Partial<ProductEditorKauflandDraft>) => void;
  onApply: () => void;
  eanValue: string;
  isEanValid: boolean;
  searching: boolean;
  onChangeEan: (value: string) => void;
  onSearch: () => void;
};

const editableFields: Array<[keyof ProductEditorKauflandDraft, string]> = [
  ["mpn", "MPN"], ["manufacturer", "Manufacturer"], ["product_dimensions", "Product dimensions"],
  ["colour", "Colour"], ["material", "Material"], ["length", "Length"], ["width", "Width"],
  ["height", "Height"], ["storefront", "Storefront"], ["material_composition", "Material composition"],
  ["abnehmbarer_bezug", "Removable cover"], ["parts_of_animal_origin", "Parts of animal origin"],
  ["unit_id", "Unit ID"], ["size", "Size"], ["color", "Color"], ["delivery", "Delivery"],
];

const structuredFields: Array<[keyof ProductEditorKauflandDraft, string]> = [
  ["category", "Category"], ["picture", "Pictures"], ["picture_urls", "Picture URLs"],
  ["product_safety_contact", "Product safety contact"], ["category_detail", "Category detail"],
];

function toCreateDraft(draft: ProductEditorKauflandDraft): KauflandCreateProductDraft {
  return {
    title: draft.title,
    ean: draft.ean,
    price: draft.price,
    shortDescription: draft.short_description.join("\n"),
    description: draft.description,
    product: Object.fromEntries([
      ...editableFields.map(([key]) => [key, draft[key]]),
      ...structuredFields.map(([key]) => [key, draft[key]]),
    ]),
  };
}

function applyCreateDraft(draft: KauflandCreateProductDraft, onChange: Props["onChange"]) {
  const product = draft.product;
  onChange({
    title: draft.title,
    ean: draft.ean,
    price: draft.price,
    short_description: draft.shortDescription.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    description: draft.description,
    ...Object.fromEntries(editableFields.map(([key]) => [key, String(product[key] ?? "")])),
    ...Object.fromEntries(structuredFields.map(([key]) => [key, Array.isArray(product[key]) ? product[key] : []])),
  } as Partial<ProductEditorKauflandDraft>);
}

export function ProductEditorKauflandPanel(props: Props) {
  const initialDraft = toCreateDraft(props.draft);
  const draftKey = `${props.draft.target_id}:${props.draft.ean}`;

  return (
    <div className="space-y-4 rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <KauflandProductDetailsPanel
            initialDraft={initialDraft}
            draftKey={draftKey}
            codeLabel="Code"
            previewLabel="Preview"
            previewDocumentFor={(description) => description}
            deliveryPortalId="product-editor-kaufland-delivery"
            renderDeliveryTimeRange={() => null}
            renderProductFields={(product, onProductChange) => (
              <KauflandProductFields product={product} onProductChange={onProductChange} />
            )}
            onDraftChange={(draft) => applyCreateDraft(draft, props.onChange)}
          />
        </div>
        <aside className="w-full space-y-3 xl:ml-auto xl:w-[520px] xl:flex-none">
          <KauflandEditorGallery draft={props.draft} onChange={props.onChange} />
          <div id="product-editor-kaufland-delivery" />
        </aside>
      </div>
      {props.warnings.map((warning) => <p key={warning.code} className="text-sm text-amber-700">{warning.message}</p>)}
      <button type="button" className="rounded-[var(--radius-pill)] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={props.loading || props.applyLoading || props.changedFields.length === 0} onClick={props.onApply}>
        {props.applyLoading ? "Applying" : "Review and apply Kaufland changes"}
      </button>
    </div>
  );
}

function KauflandEditorGallery({ draft, onChange }: Pick<Props, "draft" | "onChange">) {
  const imageUrls = Array.from(new Set([...draft.picture_urls, ...draft.picture].map((url) => String(url).trim()).filter(Boolean)));
  const items = imageUrls.map((src, index) => ({ id: `${index}:${src}`, src, isLocal: false }));
  const [activeItemId, setActiveItemId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    setActiveItemId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id ?? ""));
  }, [items]);

  const updateImages = (nextUrls: string[]) => onChange({ picture_urls: nextUrls, picture: nextUrls });

  return (
    <CreateProductImageGallery
      items={items}
      activeItemId={activeItemId}
      previewAlt="Kaufland product image preview"
      emptyPreviewLabel="No image"
      emptyGalleryLabel="No gallery images"
      thumbnailAlt={(index) => `Kaufland product image ${index + 1}`}
      deleteAlt={(index) => `Delete Kaufland product image ${index + 1}`}
      onActiveItemChange={setActiveItemId}
      onDeleteItem={(itemId) => updateImages(items.filter((item) => item.id !== itemId).map((item) => item.src))}
      onMoveItem={(sourceItemId, targetItemId) => {
        const sourceIndex = items.findIndex((item) => item.id === sourceItemId);
        const targetIndex = items.findIndex((item) => item.id === targetItemId);
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
        const nextUrls = [...imageUrls];
        const [moved] = nextUrls.splice(sourceIndex, 1);
        nextUrls.splice(targetIndex, 0, moved);
        updateImages(nextUrls);
      }}
    />
  );
}
