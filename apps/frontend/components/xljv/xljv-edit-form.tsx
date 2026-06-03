"use client";

import { Dispatch, FormEvent, SetStateAction, useMemo, useState } from "react";
import { useLabels } from "../../app/use-labels";
import {
  DescriptionsCard,
  JVFieldsCard,
  MainFieldsCard,
  RubricAssignmentCard
} from "./xljv-edit-form-detail";
import { ProductGalleryCard } from "./xljv-edit-form-sidebar";
import { ProductEditorActionBar } from "./xljv-edit-form-publish";
import {
  RubricTreeNode,
  Site,
  SiteLanguageMapPreview,
  XLAllSitesResult,
  XLJVProduct
} from "./xljv-edit-utils";

type XLJVEditFormProps = {
  ean: string;
  site: Site;
  siteKey: string;
  form: XLJVProduct;
  saving: boolean;
  sitesLoading: boolean;
  batchSending: boolean;
  batchStatus: string | null;
  batchErrors: string[];
  batchLanguageMapsAttempted: boolean;
  batchLanguageMaps: SiteLanguageMapPreview[];
  allSitesResult: XLAllSitesResult | null;
  selectedSiteKeys: string[];
  templateSiteKey: string;
  setTemplateSiteKey: Dispatch<SetStateAction<string>>;
  setForm: Dispatch<SetStateAction<XLJVProduct | null>>;
  onToggleSelectedSite: (siteKeyValue: string) => void;
  onLoadProductBySiteKey: (siteKeyValue: string) => Promise<void>;
  onHandleSave: (event: FormEvent) => Promise<void>;
  onHandleLoadAllSites: () => Promise<void>;
  onHandleSendToSelectedSites: () => Promise<void>;
  rubrics: RubricTreeNode[];
  rubricsLoading: boolean;
  onReloadRubrics: () => Promise<void>;
  onToggleRubric: (id: number) => void;
  onSetMainRubric: (id: number) => void;
  deliveryOptions: Array<{ id: number; label: string; is_default?: boolean }>;
  deliveryOptionsLoading: boolean;
  imageUploadLoading: boolean;
  onUploadImages: (files: FileList | null, imageRole?: "main" | "additional") => Promise<void>;
};

function getComputedUvp(priceValue: XLJVProduct["price"]) {
  function roundUpToNextNine(value: number): number {
    const integer = Math.ceil(value);
    const remainder = integer % 10;
    if (remainder === 9) return integer;
    return integer + (9 - remainder);
  }
  const price = Number(String(priceValue ?? "").replace(",", "."));
  if (!Number.isFinite(price)) return "";
  if (price > 5000) return String(roundUpToNextNine(price * 1.1));
  if (price >= 2500 && price <= 4999) return String(roundUpToNextNine(price * 1.18));
  if (price >= 1000 && price <= 2499) return String(roundUpToNextNine(price * 1.25));
  return String(roundUpToNextNine(price * 1.35));
}

function buildRubricTree(rubrics: RubricTreeNode[]) {
  const byParent = new Map<number, RubricTreeNode[]>();
  for (const node of rubrics) {
    const parent = Number(node.parent_id || 0);
    const list = byParent.get(parent) || [];
    list.push(node);
    byParent.set(parent, list);
  }
  const build = (parentId: number): RubricTreeNode[] =>
    (byParent.get(parentId) || []).map((node) => ({ ...node, children: build(Number(node.id)) }));
  return build(0);
}

export function XLJVEditForm(props: XLJVEditFormProps) {
  useLabels();
  const {
    site,
    siteKey,
    form,
    saving,
    batchSending,
    setForm,
    onHandleSave,
    onHandleSendToSelectedSites,
    rubrics,
    rubricsLoading,
    onReloadRubrics,
    onToggleRubric,
    onSetMainRubric,
    deliveryOptions,
    deliveryOptionsLoading,
    imageUploadLoading,
    onUploadImages
  } = props;

  const [activeImageUrl, setActiveImageUrl] = useState("");

  function getJvContent(languageCode: string) {
    return (
      (form.jv_fields?.content_by_language || []).find(
        (row) => (row?.language_code || "de").toLowerCase() === languageCode.toLowerCase()
      ) || { language_code: languageCode }
    );
  }

  function setJvContentField(languageCode: string, field: string, value: string) {
    setForm((current) => {
      if (!current) return current;
      const rows = [...(current.jv_fields?.content_by_language || [])];
      const idx = rows.findIndex(
        (row) => (row?.language_code || "de").toLowerCase() === languageCode.toLowerCase()
      );
      const next = { ...(idx >= 0 ? rows[idx] : { language_code: languageCode }), [field]: value };
      if (idx >= 0) rows[idx] = next;
      else rows.push(next);
      return { ...current, jv_fields: { ...(current.jv_fields || {}), content_by_language: rows } };
    });
  }

  const imageUrls = useMemo(() => {
    const values = [
      String(form.image_public_url || "").trim(),
      String(form.image || "").trim(),
      ...(form.images_public_urls || []).flatMap((row) => [
        String(row.public_url || "").trim(),
        String(row.image || "").trim()
      ]),
      ...(form.images || []).map((row) => String(row.image || "").trim())
    ].filter(Boolean);
    const byKey = new Map<string, string>();
    for (const value of values) {
      const key = value.replace(/\.([a-z0-9]+)(\?.*)?$/i, (_, ext: string, query: string = "") => `.${ext.toLowerCase()}${query}`);
      if (!byKey.has(key)) byKey.set(key, value);
    }
    return Array.from(byKey.values());
  }, [form.image_public_url, form.image, form.images_public_urls, form.images]);

  const computedUvp = getComputedUvp(form.price);
  const displayImageUrl = activeImageUrl || imageUrls[0] || "";
  const selectedRubricIds = (form.categories || [])
    .map((row) => Number(row.category_id))
    .filter((id) => Number.isFinite(id));
  const mainRubricId = (form.categories || []).find((row) => row.main_category)?.category_id ?? null;
  const rubricsTree = useMemo(() => buildRubricTree(rubrics), [rubrics]);

  const commonProps = {
    form,
    site,
    setForm,
    computedUvp,
    getJvContent,
    setJvContentField
  };
  const deliveryProps = { deliveryOptions, deliveryOptionsLoading };

  return (
    <form onSubmit={(event) => void onHandleSave(event)} className="space-y-4">
      <ProductEditorActionBar
        saving={saving}
        batchSending={batchSending}
        onReset={() => window.location.reload()}
        onSendToSelectedSites={onHandleSendToSelectedSites}
      />
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,65fr)_minmax(320px,35fr)]">
        <aside className="order-1 space-y-4 xl:order-2">
          <ProductGalleryCard
            form={form}
            site={site}
            siteKey={siteKey}
            setForm={setForm}
            imageUrls={imageUrls}
            displayImageUrl={displayImageUrl}
            activeImageUrl={activeImageUrl}
            setActiveImageUrl={setActiveImageUrl}
            imageUploadLoading={imageUploadLoading}
            onUploadImages={onUploadImages}
          />
          <RubricAssignmentCard
            rubricsLoading={rubricsLoading}
            onReloadRubrics={onReloadRubrics}
            rubricsTree={rubricsTree}
            selectedRubricIds={selectedRubricIds}
            mainRubricId={mainRubricId}
            onToggleRubric={onToggleRubric}
            onSetMainRubric={onSetMainRubric}
          />
        </aside>

        <main className="order-2 space-y-4 xl:order-1">
          <MainFieldsCard {...commonProps} />
          {site === "JV" ? <JVFieldsCard {...commonProps} {...deliveryProps} /> : null}
          <DescriptionsCard
            form={form}
            site={site}
            setForm={setForm}
            getJvContent={getJvContent}
            setJvContentField={setJvContentField}
          />
        </main>
      </div>
    </form>
  );
}
