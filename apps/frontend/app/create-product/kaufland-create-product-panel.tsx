"use client";

import { useEffect, useState } from "react";

import { uploadKauflandImages } from "../../components/channels/kaufland-api";
import {
  applyProductEditorPlan,
  discoverProductEditor,
  getProductEditorJob,
  planProductEditor,
} from "../../components/product-editor/product-editor-api";
import { useToast } from "../../components/shared/toast-provider";
import { Button } from "../../components/ui/button";
import { FormField } from "../../components/ui/form-field";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import type { CreateProductJvSourceSnapshot } from "./create-product-source-api";

const DEFAULT_STOREFRONTS = ["de", "cz", "sk", "pl", "at", "fr", "it"];
const TARGET_BY_CONTROLLER = { jv: "KAUFLAND_JV", xl: "KAUFLAND_XL" } as const;
type KauflandAccount = keyof typeof TARGET_BY_CONTROLLER;

type KauflandCreateForm = {
  ean: string;
  controller: "jv" | "xl";
  title: string;
  description: string;
  picture: string;
  pictureUrls: string;
  price: string;
  size: string;
  color: string;
  material: string;
  delivery: string;
  height: string;
  length: string;
  width: string;
  amount: string;
  idOffer: string;
  storefronts: string;
};

function createEmptyForm(): KauflandCreateForm {
  return {
    ean: "",
    controller: "jv",
    title: "",
    description: "",
    picture: "",
    pictureUrls: "",
    price: "",
    size: "",
    color: "",
    material: "",
    delivery: "",
    height: "",
    length: "",
    width: "",
    amount: "20",
    idOffer: "",
    storefronts: DEFAULT_STOREFRONTS.join(", "),
  };
}

function splitValues(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sourceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstText(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean)));
}

function prefillKauflandForm(
  current: KauflandCreateForm,
  snapshot: CreateProductJvSourceSnapshot,
): KauflandCreateForm {
  const source = sourceRecord(snapshot.rawPayload.response_data);
  const imageUrls = Array.from(new Set([
    ...stringList(source.picture),
    ...stringList(source.picture_urls),
    ...snapshot.imageUrls,
  ]));

  return {
    ...current,
    ean: snapshot.ean || current.ean,
    controller: snapshot.siteKey === "KAUFLAND_XL" ? "xl" : "jv",
    title: firstText(source.title) || snapshot.productName || current.title,
    description: firstText(source.description) || snapshot.description || current.description,
    picture: imageUrls.join("\n") || current.picture,
    pictureUrls: imageUrls.join("\n") || current.pictureUrls,
    price: firstText(source.price) || snapshot.price || current.price,
    size: firstText(source.size) || current.size,
    color: firstText(source.color) || firstText(source.colour) || current.color,
    material: firstText(source.material) || current.material,
    delivery: firstText(source.delivery) || current.delivery,
    height: firstText(source.height) || current.height,
    length: firstText(source.length) || current.length,
    width: firstText(source.width) || current.width,
  };
}

function buildDraft(form: KauflandCreateForm): Record<string, unknown> {
  const ean = form.ean.trim();
  const picture = splitValues(form.picture);
  const pictureUrls = splitValues(form.pictureUrls);
  const requiredFields: Array<[keyof KauflandCreateForm, string]> = [
    ["title", "Title"],
    ["description", "Description"],
    ["price", "Price"],
    ["size", "Size"],
    ["color", "Color"],
    ["material", "Material"],
    ["delivery", "Delivery"],
    ["height", "Height"],
    ["length", "Length"],
    ["width", "Width"],
  ];
  const missing = requiredFields
    .filter(([field]) => !form[field].trim())
    .map(([, label]) => label);
  if (missing.length > 0) {
    throw new Error(`Required fields: ${missing.join(", ")}.`);
  }
  if (picture.length === 0 && pictureUrls.length === 0) {
    throw new Error("Provide at least one Picture URL or Picture URLs value.");
  }
  const integers: Array<[string, string]> = [
    ["delivery", form.delivery],
    ["amount", form.amount],
  ];
  for (const [field, value] of integers) {
    if (!/^\d+$/.test(value.trim())) {
      throw new Error(`${field} must be an integer.`);
    }
  }
  const decimals: Array<[string, string]> = [
    ["price", form.price],
    ["height", form.height],
    ["length", form.length],
    ["width", form.width],
  ];
  for (const [field, value] of decimals) {
    if (!/^\d+(?:\.\d+)?$/.test(value.trim())) {
      throw new Error(`${field} must be a decimal number.`);
    }
  }

  return {
    title: form.title.trim(),
    description: form.description.trim(),
    ...(picture.length > 0 ? { picture } : {}),
    ...(pictureUrls.length > 0 ? { picture_urls: pictureUrls } : {}),
    price: form.price.trim(),
    size: form.size.trim(),
    color: form.color.trim(),
    material: form.material.trim(),
    delivery: Number(form.delivery),
    height: form.height.trim(),
    length: form.length.trim(),
    width: form.width.trim(),
    amount: Number(form.amount),
    id_offer: form.idOffer.trim() || ean,
    storefronts: splitValues(form.storefronts),
  };
}

export function KauflandCreateProductPanel({
  account,
  prefill,
}: {
  account: KauflandAccount;
  prefill: CreateProductJvSourceSnapshot | null;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<KauflandCreateForm>(createEmptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  useEffect(() => {
    setForm((current) => {
      if (!prefill) {
        return { ...current, controller: account };
      }
      return { ...prefillKauflandForm(current, prefill), controller: account };
    });
  }, [account, prefill]);

  function updateField(field: keyof KauflandCreateForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function uploadImages() {
    const ean = form.ean.trim();
    if (!ean) {
      showToast("Enter an EAN before uploading images.", "error");
      return;
    }
    if (imageFiles.length === 0) {
      showToast("Choose at least one image file.", "error");
      return;
    }

    setUploadingImages(true);
    try {
      const uploadedUrls = await uploadKauflandImages({ ean, files: imageFiles });
      setForm((current) => ({
        ...current,
        picture: [...splitValues(current.picture), ...uploadedUrls].join("\n"),
      }));
      setImageFiles([]);
      showToast(`${uploadedUrls.length} image URL(s) added.`, "success");
    } catch (uploadError) {
      showToast(uploadError instanceof Error ? uploadError.message : "Kaufland image upload failed.", "error");
    } finally {
      setUploadingImages(false);
    }
  }

  async function createProduct() {
    const ean = form.ean.trim();
    if (!ean) {
      showToast("EAN is required.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const targetId = TARGET_BY_CONTROLLER[form.controller];
      const discover = await discoverProductEditor(ean, "KAUFLAND");
      const target = discover.groups
        .find((group) => group.id === "KAUFLAND")
        ?.targets.find((item) => item.id === targetId);
      if (!target) {
        throw new Error("The selected Kaufland target is unavailable.");
      }
      if (target.status !== "missing") {
        throw new Error("This Kaufland target already exists. Use Product Editor to update it.");
      }
      const draft = buildDraft({ ...form, ean });
      const plan = await planProductEditor({
        ean,
        activeGroup: "KAUFLAND",
        changedFields: Object.keys(draft),
        draft,
        selectedTargetIds: [targetId],
      });
      const apply = await applyProductEditorPlan(plan.plan_id);
      const job = await getProductEditorJob(apply.job_id);
      showToast(`Kaufland job ${apply.job_id}: ${job.status}.`, "success");
    } catch (createError) {
      showToast(createError instanceof Error ? createError.message : "Kaufland product creation failed.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="EAN"><Input value={form.ean} onChange={(event) => updateField("ean", event.target.value)} placeholder="EAN" /></FormField>
        <FormField label="Title"><Input value={form.title} onChange={(event) => updateField("title", event.target.value)} /></FormField>
        <FormField label="Price"><Input type="number" step="0.01" value={form.price} onChange={(event) => updateField("price", event.target.value)} placeholder="199.99" /></FormField>
        <FormField label="Size"><Input value={form.size} onChange={(event) => updateField("size", event.target.value)} /></FormField>
        <FormField label="Color"><Input value={form.color} onChange={(event) => updateField("color", event.target.value)} /></FormField>
        <FormField label="Material"><Input value={form.material} onChange={(event) => updateField("material", event.target.value)} /></FormField>
        <FormField label="Delivery ID"><Input type="number" min="0" value={form.delivery} onChange={(event) => updateField("delivery", event.target.value)} placeholder="28" /></FormField>
        <FormField label="Height"><Input type="number" step="0.01" value={form.height} onChange={(event) => updateField("height", event.target.value)} placeholder="80" /></FormField>
        <FormField label="Length"><Input type="number" step="0.01" value={form.length} onChange={(event) => updateField("length", event.target.value)} placeholder="200" /></FormField>
        <FormField label="Width"><Input type="number" step="0.01" value={form.width} onChange={(event) => updateField("width", event.target.value)} placeholder="100" /></FormField>
        <FormField label="Amount"><Input type="number" min="1" value={form.amount} onChange={(event) => updateField("amount", event.target.value)} /></FormField>
        <FormField label="Offer ID"><Input value={form.idOffer} onChange={(event) => updateField("idOffer", event.target.value)} placeholder="Defaults to EAN" /></FormField>
        <FormField label="Storefronts" className="md:col-span-2"><Input value={form.storefronts} onChange={(event) => updateField("storefronts", event.target.value)} /></FormField>
        <FormField label="Description" className="md:col-span-2"><Textarea className="min-h-[140px]" value={form.description} onChange={(event) => updateField("description", event.target.value)} /></FormField>
        <FormField label="Picture URLs" className="md:col-span-2"><Textarea className="min-h-[100px]" value={form.picture} onChange={(event) => updateField("picture", event.target.value)} placeholder="One URL per line" /></FormField>
        <FormField label="Alternative picture_urls" className="md:col-span-2"><Textarea className="min-h-[100px]" value={form.pictureUrls} onChange={(event) => updateField("pictureUrls", event.target.value)} placeholder="One URL per line" /></FormField>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <FormField label="Upload image files" className="min-w-72 flex-1"><Input type="file" accept="image/*" multiple disabled={submitting || uploadingImages} onChange={(event) => setImageFiles(Array.from(event.target.files ?? []))} /></FormField>
        <Button type="button" variant="secondary" onClick={() => void uploadImages()} disabled={submitting || uploadingImages || imageFiles.length === 0}>{uploadingImages ? "Uploading images" : "Upload images"}</Button>
        <Button type="button" onClick={() => void createProduct()} disabled={submitting || uploadingImages}>{submitting ? "Creating" : "Create Kaufland product"}</Button>
      </div>
    </section>
  );
}
