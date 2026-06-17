export type Site = "XL" | "JV";

export const SITE_KEY_OPTIONS: Record<Site, Array<{ value: string; label: string }>> = {
  XL: [
    { value: "ALL_SITES", label: "All XL sites" },
    { value: "", label: "Auto (default XL source)" },
    { value: "XLMOEBEL_DE", label: "xlmoebel.de" },
    { value: "XLMOEBEL_CH", label: "xlmoebel.ch" },
    { value: "XLMOBILI_IT", label: "xlmobili.it" },
    { value: "XLMEUBILAIR_NL", label: "xlmeubilair.nl" },
    { value: "XLMEBELES_LV", label: "xlmebeles.lv" },
    { value: "XLMOEBEL_LU", label: "xlmoebel.lu" },
    { value: "XLNABYTEK_CZ", label: "xlnabytek.cz" },
    { value: "XLPOSLOVNO_SI", label: "xlposlovno.si" },
    { value: "XLFURNITURE_CO_UK", label: "xlfurniture.co.uk" },
    { value: "XLBUTOROK_HU", label: "xlbutorok.hu" },
    { value: "XLHOME_GR", label: "xlhome.gr" },
    { value: "XLMEBLE_PL", label: "xlmeble.pl" },
    { value: "XLMEUBELLA_BE", label: "xlmeubella.be" },
    { value: "XLMEUBLES_FR", label: "xlmeubles.fr" },
    { value: "XLMOEBEL_AT", label: "xlmoebel.at" },
    { value: "XLMUEBLES_ES", label: "xlmuebles.es" },
    { value: "XLFURNITURE_IE", label: "xlfurniture.ie" },
    { value: "XLHUONEKALUT_FI", label: "xlhuonekalut.fi" },
    { value: "XLMOBILA_RO", label: "xlmobila.ro" },
    { value: "XLMOBILIARIO_PT", label: "xlmobiliario.pt" },
    { value: "XLMOBLER_SE", label: "xlmobler.se" },
    { value: "XLNABYTOK_SK", label: "xlnabytok.sk" },
    { value: "XXLMOBLER_DK", label: "xxlmobler.dk" }
  ],
  JV: [
    { value: "ALL_SITES", label: "All JV sites" },
    { value: "", label: "Auto (default JV source)" },
    { value: "JV_DE", label: "jv.de" },
    { value: "JV_CO_UK", label: "jv.co.uk" },
    { value: "JV_CH", label: "jv.ch" },
    { value: "JV_AT", label: "jv.at" }
  ]
};

export type ProductDescription = {
  id?: number;
  language_id?: number;
  name?: string;
  description?: string;
  tag?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keyword?: string;
};

export type ProductCategory = { id?: number; category_id?: number; main_category?: boolean };
export type ProductStore = { id?: number; store_id?: number };
export type ProductImage = { id?: number; image?: string; sort_order?: number };
export type ProductSpecial = {
  id?: number;
  customer_group_id?: number;
  priority?: number;
  price?: string | number;
  date_start?: string | null;
  date_end?: string | null;
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
  }>;
};

export type XLJVResponse = {
  id?: number;
  site?: string;
  ean?: string;
  source_product_id?: number;
  source_sku?: string;
  source_model?: string;
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
  date_available?: string | null;
  date_modified_in_source?: string | null;
  created_at?: string;
  updated_at?: string;
  user_create?: string;
  update_user?: string;
  local_exists?: boolean;
  local_id?: number | null;
  descriptions?: ProductDescription[];
  categories?: ProductCategory[];
  stores?: ProductStore[];
  images?: ProductImage[];
  specials?: ProductSpecial[];
  jv_fields?: JVFields | null;
  detail?: string;
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

export type XLJVCreateFormState = {
  ean: string;
  source_product_id: string;
  source_model: string;
  source_sku: string;
  source_ean_field: string;
  manufacturer_id: string;
  stock_status_id: string;
  tax_class_id: string;
  shipping: boolean;
  subtract: boolean;
  minimum: string;
  points: string;
  sort_order: string;
  seo_url: string;
  date_available: string;
  image: string;
  categories_json: string;
  stores_json: string;
  images_json: string;
  specials_json: string;
  descriptions_json: string;
  price: string;
  quantity: string;
  status: boolean;
  name: string;
  description: string;
  short_description: string;
  short_description_real: string;
  description_html: string;
  tag: string;
  meta_title: string;
  meta_description: string;
  meta_keyword: string;
  jv_urlkey: string;
  jv_uvp: string;
  jv_mwstid: string;
  jv_lieferzeitid: string;
  jv_einheitid: string;
  jv_grundeinheit: string;
  jv_vpe: string;
  jv_preisbasis: string;
  jv_preisfilter: string;
  jv_is_sofort: boolean;
};

export function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function looksLikeHtml(value: string): boolean {
  return /<[^>]+>/.test(value);
}

export function normalizeHtmlToText(value: string): string {
  const decoded = decodeBasicHtmlEntities(value || "");
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

export function buildLocalUrl(path: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `/api/v1/services${path}${query ? `?${query}` : ""}`;
}
