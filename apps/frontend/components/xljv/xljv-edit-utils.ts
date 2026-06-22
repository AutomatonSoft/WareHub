export type Site = "XL" | "JV";

export type ProductDescription = {
  language_id?: number;
  name?: string;
  description?: string;
  tag?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keyword?: string;
};

export type ProductCategory = { category_id?: number; main_category?: boolean };
export type ProductStore = { store_id?: number };
export type ProductImage = { image?: string; sort_order?: number };
export type ProductImagePublic = { image?: string; sort_order?: number; public_url?: string };
export type ProductSpecial = {
  customer_group_id?: number;
  priority?: number;
  price?: string | number;
  date_start?: string | null;
  date_end?: string | null;
};

export type RubricTreeNode = {
  id: number;
  category_id: number;
  parent_id: number;
  name: string;
  rubnum?: string;
  rub_parent?: string;
  urlkey?: string;
  sort_order?: number;
  children?: RubricTreeNode[];
};

export type JVFields = {
  artikelid?: number | string;
  artikelnr?: string;
  jfsku?: string;
  ean?: string;
  inaktiv?: number | string;
  geaendert?: string | null;
  currency_code?: string | null;
  languages?: string[];
  content_by_language?: Array<{
    language_code?: string;
    name?: string;
    keywords?: string;
    description?: string;
    bezeichnung?: string;
    meta_title?: string;
    meta_description?: string;
    meta_keyword?: string;
    short_description?: string;
    short_description_real?: string;
    kurzbeschreibung?: string;
  }>;
  is_sofort?: boolean | number | string;
  mwstid?: number | string;
  lieferzeitid?: number | string;
  einheitid?: number | string;
  grundeinheit?: number | string;
  vpe?: number | string;
  uvp?: string | number;
  preisbasis?: string;
  preisfilter?: string;
  urlkey?: string;
  liefernr?: string;
  supplier_liefernr?: string;
};

export type XLJVProduct = {
  id?: number;
  ean?: string;
  site?: string;
  source_product_id?: number;
  source_model?: string;
  source_sku?: string;
  source_ean_field?: string;
  price?: string | number;
  quantity?: number;
  status?: boolean;
  manufacturer_id?: number;
  stock_status_id?: number;
  tax_class_id?: number;
  shipping?: boolean;
  subtract?: boolean;
  minimum?: number;
  points?: number;
  sort_order?: number;
  seo_url?: string;
  image?: string;
  image_public_url?: string;
  date_available?: string | null;
  created_at?: string;
  updated_at?: string;
  user_create?: string;
  update_user?: string;
  descriptions?: ProductDescription[];
  categories?: ProductCategory[];
  stores?: ProductStore[];
  images?: ProductImage[];
  images_public_urls?: ProductImagePublic[];
  specials?: ProductSpecial[];
  jv_fields?: JVFields | null;
  detail?: string;
  error?: string;
};

export type XLAllSitesResult = {
  query_ean: string;
  found: Array<{
    site_key: string;
    domain: string;
    product_id: number;
    ean: string;
    price: string | number | null;
    currency_code?: string | null;
    title: string;
  }>;
  missing: Array<{
    site_key: string;
    domain: string;
    reason: string;
    error?: string;
  }>;
  found_count: number;
  missing_count: number;
};

export type SiteLanguageMapPreview = {
  siteKey: string;
  domain: string;
  targetLocale: string;
  languageIdByLocale: Record<string, number>;
};

export function buildLocalUrl(path: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `/api/v1/services${path}${query ? `?${query}` : ""}`;
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/gi, "ß")
    .replace(/&amp;/g, "&");
}

export function stripHtml(value: string): string {
  if (!value) return "";
  const decoded = decodeBasicHtmlEntities(value);
  return decoded
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toNumberOrNull(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
}

export type PatchPayload = Record<string, unknown>;

export function buildPatchPayload(form: XLJVProduct): PatchPayload {
  const jvFields = form.jv_fields || {};
  const jvContentByLanguage = Array.isArray(jvFields.content_by_language) ? jvFields.content_by_language : [];
  return {
    source_model: form.source_model || "",
    source_sku: form.source_sku || "",
    source_ean_field: form.source_ean_field || "",
    price: form.price === "" || form.price === undefined || form.price === null ? null : String(form.price),
    quantity: form.quantity === undefined || form.quantity === null ? null : Number(form.quantity),
    status: Boolean(form.status),
    manufacturer_id: form.manufacturer_id ?? null,
    stock_status_id: form.stock_status_id ?? null,
    tax_class_id: form.tax_class_id ?? null,
    shipping: form.shipping ?? true,
    subtract: form.subtract ?? true,
    minimum: form.minimum ?? null,
    points: form.points ?? null,
    sort_order: form.sort_order ?? null,
    seo_url: form.seo_url || "",
    image: form.image || "",
    date_available: form.date_available || null,
    update_user: form.update_user || "",
    descriptions: (form.descriptions || []).map((d) => ({
      language_id: d.language_id ?? 1,
      name: d.name || "",
      description: d.description || "",
      tag: d.tag || "",
      meta_title: d.meta_title || "",
      meta_description: d.meta_description || "",
      meta_keyword: d.meta_keyword || ""
    })),
    categories: (form.categories || [])
      .map((c) => ({ category_id: c.category_id ?? null, main_category: Boolean(c.main_category) }))
      .filter((c) => c.category_id !== null),
    stores: (form.stores || [])
      .map((s) => ({ store_id: s.store_id ?? null }))
      .filter((s) => s.store_id !== null),
    images: (form.images || [])
      .map((i) => ({ image: i.image || "", sort_order: i.sort_order ?? 0 }))
      .filter((i) => i.image.trim() !== ""),
    specials: (form.specials || [])
      .map((s) => ({
        customer_group_id: s.customer_group_id ?? 1,
        priority: s.priority ?? 0,
        price: s.price ?? null,
        date_start: s.date_start || null,
        date_end: s.date_end || null
      }))
      .filter((s) => s.price !== null),
    jv_fields: {
      artikelnr: jvFields.artikelnr || form.source_model || "",
      jfsku: jvFields.jfsku || form.source_sku || "",
      ean: jvFields.ean || form.source_ean_field || form.ean || "",
      inaktiv: jvFields.inaktiv ?? (form.status ? 0 : 1),
      is_sofort: jvFields.is_sofort ?? undefined,
      mwstid: jvFields.mwstid ?? undefined,
      lieferzeitid: jvFields.lieferzeitid ?? undefined,
      einheitid: jvFields.einheitid ?? undefined,
      grundeinheit: jvFields.grundeinheit ?? undefined,
      vpe: jvFields.vpe ?? undefined,
      preisbasis: jvFields.preisbasis || undefined,
      preisfilter: jvFields.preisfilter || undefined,
      urlkey: jvFields.urlkey || undefined,
      liefernr: jvFields.liefernr || jvFields.supplier_liefernr || undefined,
      supplier_liefernr: jvFields.supplier_liefernr || jvFields.liefernr || undefined,
      content_by_language: jvContentByLanguage.map((row) => ({
        language_code: row.language_code || "de",
        name: row.name || "",
        keywords: row.keywords || "",
        description: row.description || "",
        bezeichnung: row.bezeichnung || row.short_description || "",
        meta_title: row.meta_title || "",
        meta_description: row.meta_description || "",
        meta_keyword: row.meta_keyword || "",
        short_description: row.short_description || row.bezeichnung || "",
        short_description_real: row.short_description_real || row.kurzbeschreibung || "",
        kurzbeschreibung: row.kurzbeschreibung || row.short_description_real || ""
      }))
    }
  };
}

function isSameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildDiffPayload(current: PatchPayload, baseline: PatchPayload | null): PatchPayload {
  if (!baseline) return current;
  const diff: PatchPayload = {};
  for (const key of Object.keys(current)) {
    if (!isSameValue(current[key], baseline[key])) {
      diff[key] = current[key];
    }
  }
  return diff;
}

type DescriptionPatchRow = {
  language_id: number;
  name: string;
  description: string;
  tag: string;
  meta_title: string;
  meta_description: string;
  meta_keyword: string;
};

function normalizeDescriptionRow(value: unknown): DescriptionPatchRow | null {
  const row = value as Record<string, unknown>;
  const lang = Number(row?.language_id ?? 0);
  if (!Number.isFinite(lang) || lang <= 0) return null;
  return {
    language_id: lang,
    name: String(row?.name ?? ""),
    description: String(row?.description ?? ""),
    tag: String(row?.tag ?? ""),
    meta_title: String(row?.meta_title ?? ""),
    meta_description: String(row?.meta_description ?? ""),
    meta_keyword: String(row?.meta_keyword ?? "")
  };
}

export function extractChangedDescriptions(
  currentPayload: PatchPayload,
  baselinePayload: PatchPayload | null
): DescriptionPatchRow[] {
  const currentRaw = Array.isArray(currentPayload.descriptions) ? currentPayload.descriptions : [];
  const baselineRaw = Array.isArray(baselinePayload?.descriptions) ? baselinePayload?.descriptions : [];

  const baselineByLang = new Map<number, string>();
  for (const row of baselineRaw) {
    const normalized = normalizeDescriptionRow(row);
    if (!normalized) continue;
    baselineByLang.set(normalized.language_id, JSON.stringify(normalized));
  }

  const changed: DescriptionPatchRow[] = [];
  for (const row of currentRaw) {
    const normalized = normalizeDescriptionRow(row);
    if (!normalized) continue;
    const currentJson = JSON.stringify(normalized);
    const baselineJson = baselineByLang.get(normalized.language_id);
    if (currentJson !== baselineJson) changed.push(normalized);
  }
  return changed;
}
