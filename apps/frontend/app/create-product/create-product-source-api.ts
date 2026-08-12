import {
  fetchKidDetails,
  getServicesApiBase,
} from "../../components/inventory/inventory-api";
import {
  xljvGetProductByEan,
  xljvGetSitesByEan,
} from "../../components/xljv/xljv-api";
import { fetchHoodByEan } from "../../components/hood/hood-api";
import { decodeHtmlEntities, extractFirstItemFromPayload, type HoodAccount } from "../../components/hood/hood-search-utils";
import { fetchKauflandByEan, type KauflandSite } from "../../components/channels/kaufland-api";
import { normalizeEanOrEmpty } from "../../components/inventory/ean-utils";
import { apiFetch } from "../../lib/api/client";

type KidMarketplaceEansResponse = {
  main_ean?: unknown;
};

type DescriptionRow = {
  language_id?: unknown;
  language_code?: unknown;
  name?: unknown;
  description?: unknown;
};

type CategoryRow = {
  category_id?: unknown;
  id?: unknown;
  main_category?: unknown;
  name?: unknown;
};

export type CreateProductKidContext = {
  kidId: number;
  kidNumber: string;
  mainEan: string;
  place: string;
  room: string;
  furnitureType: string;
  commentary: string;
};

export type CreateProductJvSourceSite = {
  siteKey: string;
  domain: string;
  productId: number | null;
  ean: string;
  price: string;
  title: string;
};

export type CreateProductJvSourceSnapshot = {
  siteKey: string;
  sourceProductId: number | null;
  ean: string;
  price: string;
  productName: string;
  description: string;
  shortDescription: string;
  imagesText: string;
  imageUrls: string[];
  categories: Array<{ id: number; name: string; main: boolean }>;
  hoodFields?: CreateProductHoodSourceFields;
  rawPayload: Record<string, unknown>;
};

export type CreateProductHoodSourceFields = {
  quantity: string;
  categoryId: string;
  condition: string;
  itemMode: string;
  itemNumber: string;
  productPropertiesText: string;
};

export type CreateProductSourceSiteKind = "JV" | "XL" | "HOOD" | "KAUFLAND";
export const CREATE_PRODUCT_XL_DEFAULT_SITE_KEY = "XLMOEBEL_DE";

export type XlManufacturerOption = {
  manufacturerId: string;
  name: string;
  deliveryTime: string;
};

function asTrimmedString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asNumberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchKidMarketplaceMainEan(kidId: number): Promise<string> {
  const response = await apiFetch(`${getServicesApiBase()}/kids/${kidId}/marketplace-eans/`);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { detail?: unknown };
    throw new Error(asTrimmedString(payload.detail) || `create_product_main_ean_http:${response.status}`);
  }
  const payload = (await response.json()) as KidMarketplaceEansResponse;
  return normalizeEanOrEmpty(asTrimmedString(payload.main_ean));
}

function pickGermanLikeDescription(descriptions: DescriptionRow[]): DescriptionRow | null {
  const byCode = descriptions.find((row) => asTrimmedString(row.language_code).toLowerCase() === "de");
  if (byCode) return byCode;
  const byId = descriptions.find((row) => asNumberOrNull(row.language_id) === 1);
  if (byId) return byId;
  return descriptions[0] ?? null;
}

function normalizeSourceSites(payload: {
  found?: Array<Record<string, unknown>>;
}): CreateProductJvSourceSite[] {
  return Array.isArray(payload.found)
    ? payload.found
        .map((row) => ({
          siteKey: asTrimmedString(row.site_key),
          domain: asTrimmedString(row.domain),
          productId: asNumberOrNull(row.product_id),
          ean: asTrimmedString(row.ean),
          price: asTrimmedString(row.price),
          title: asTrimmedString(row.title),
        }))
        .filter((row) => row.siteKey)
    : [];
}

// Mirrors the backend JV_PUBLIC_BASE_BY_SITE_KEY (jv_services/sync_utils.py): the
// public host that serves the cosmoshop media for each JV site.
const JV_SITE_PUBLIC_BASE: Record<string, string> = {
  JV_DE: "https://www.jvmoebel.de",
  JV_AT: "https://www.jvmoebel.at",
  JV_CH: "https://www.jvmoebel.ch",
  JV_CO_UK: "https://www.jvfurniture.co.uk",
};

// Make an image reference safe to use as an <img> src and as a relay/fetch source.
// The backend usually returns absolute public URLs, but when the public base is
// missing it falls back to a bare relative path like "cosmoshop/default/pix/...".
// Rendering that relative path resolves against the app origin and hits the
// POST-only /api/v1/uploads/images/ route (HTTP 405), so always resolve relatives
// against the site's public media host instead.
function toAbsoluteImageUrl(raw: string, siteKey: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }
  const base = JV_SITE_PUBLIC_BASE[siteKey.trim().toUpperCase()] || JV_SITE_PUBLIC_BASE.JV_DE;
  return `${base}/${value.replace(/^\/+/, "")}`;
}

function getImageUrl(value: unknown): string {
  if (typeof value === "string") return asTrimmedString(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";

  const record = value as Record<string, unknown>;
  return asTrimmedString(record.public_url) || asTrimmedString(record.image) || asTrimmedString(record.url);
}

function normalizeImageUrls(payload: Record<string, unknown>, siteKey: string): string[] {
  const urls: string[] = [];
  const mainImage = asTrimmedString(payload.image_public_url) || asTrimmedString(payload.image);
  if (mainImage) urls.push(toAbsoluteImageUrl(mainImage, siteKey));

  for (const gallery of [payload.images_public_urls, payload.images]) {
    if (!Array.isArray(gallery)) continue;
    for (const row of gallery) {
      const url = getImageUrl(row);
      if (url) urls.push(toAbsoluteImageUrl(url, siteKey));
    }
  }

  return Array.from(new Set(urls.filter(Boolean)));
}

function normalizeCategories(payload: Record<string, unknown>): Array<{ id: number; name: string; main: boolean }> {
  const rows = Array.isArray(payload.categories) ? payload.categories : [];
  return rows
    .map((row) => {
      const item = row as CategoryRow;
      const id = asNumberOrNull(item.category_id ?? item.id);
      if (id === null) return null;
      return {
        id,
        name: asTrimmedString(item.name) || `Category ${id}`,
        main: Boolean(item.main_category),
      };
    })
    .filter((row): row is { id: number; name: string; main: boolean } => Boolean(row));
}

function stringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.map((item) => {
    if (typeof item === "string" || typeof item === "number") return asTrimmedString(item);
    return getImageUrl(item);
  }).filter(Boolean)));
}

function sourceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstText(value: unknown): string {
  if (Array.isArray(value)) return asTrimmedString(value[0]);
  return asTrimmedString(value);
}

function firstAvailableText(product: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = firstText(product[key]);
    if (value) return value;
  }
  return "";
}

function firstKauflandProductRecord(payload: Record<string, unknown>): Record<string, unknown> {
  const responseData = sourceRecord(payload.response_data);
  const data = sourceRecord(responseData.data);
  const payloadData = sourceRecord(payload.data);
  const candidates = [
    sourceRecord(responseData.product),
    sourceRecord(data.product),
    responseData,
    sourceRecord(payloadData.product),
    payloadData,
    sourceRecord(payload.product),
    payload,
  ];

  const productKeys = new Set([
    "ean", "product_ean", "title", "name", "product_name", "product_title", "price",
    "standard_price", "description", "picture", "picture_urls", "images", "image_urls",
  ]);
  return candidates.find((candidate) => Object.keys(candidate).some((key) => productKeys.has(key)))
    ?? candidates.find((candidate) => Object.keys(candidate).length > 0)
    ?? {};
}

function normalizeKauflandImageUrl(value: string): string {
  const url = value.trim();
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;

  try {
    const parsed = new URL(url);
    if (
      (parsed.hostname === "automatonsoft.de" || parsed.hostname === "www.automatonsoft.de") &&
      parsed.pathname.startsWith("/kaufland/")
    ) {
      const fileName = parsed.pathname.split("/").filter(Boolean).at(-1);
      return fileName
        ? `https://media.cdn.kaufland.de/product-images/1024x1024/${fileName}`
        : url;
    }
  } catch {
    return url;
  }

  return url;
}

function normalizeKauflandProduct(payload: Record<string, unknown>): Record<string, unknown> {
  const product = firstKauflandProductRecord(payload);
  const imageUrls = Array.from(new Set([
    ...stringList(product.picture),
    ...stringList(product.picture_urls),
    ...stringList(product.images),
    ...stringList(product.image_urls),
    ...stringList(product.media),
  ].map(normalizeKauflandImageUrl).filter(Boolean)));

  return {
    ...product,
    title: firstAvailableText(product, ["title", "name", "product_name", "product_title"]),
    ean: firstAvailableText(product, ["ean", "product_ean"]),
    price: firstAvailableText(product, ["price", "standard_price", "sale_price"]),
    description: firstAvailableText(product, ["description", "long_description"]),
    short_description: product.short_description ?? product.shortDescription ?? product.short_description_text ?? [],
    picture: imageUrls,
    picture_urls: imageUrls,
  };
}

function hoodProductPropertiesText(value: unknown): string {
  if (!Array.isArray(value)) return "[]";
  return JSON.stringify(
    value
      .filter((property): property is Record<string, unknown> => Boolean(property) && typeof property === "object" && !Array.isArray(property))
      .map((property) => ({ name: asTrimmedString(property.name), value: asTrimmedString(property.value) }))
      .filter((property) => property.name || property.value),
  );
}

function kauflandAccountFromSiteKey(siteKey: string | undefined): KauflandSite {
  return siteKey?.trim().toUpperCase() === "KAUFLAND_XL" ? "xl" : "jv";
}

function kauflandSiteKey(account: KauflandSite): string {
  return `KAUFLAND_${account.toUpperCase()}`;
}

function normalizeKauflandSnapshot(
  payload: Record<string, unknown>,
  account: KauflandSite,
  mainEan: string,
): CreateProductJvSourceSnapshot {
  const product = normalizeKauflandProduct(payload);
  const imageUrls = stringList(product.picture_urls);
  const description = firstText(product.description);

  return {
    siteKey: kauflandSiteKey(account),
    sourceProductId: null,
    ean: mainEan,
    price: firstText(product.price),
    productName: firstText(product.title) || mainEan,
    description,
    shortDescription: firstText(product.short_description) || stripHtml(description).slice(0, 255),
    imagesText: imageUrls.join("\n"),
    imageUrls,
    categories: [],
    rawPayload: { ...payload, response_data: product },
  };
}

function hoodAccountFromSiteKey(siteKey: string | undefined): HoodAccount {
  return siteKey?.trim().toUpperCase() === "HOOD_XL" ? "xl" : "jv";
}

function hoodSiteKey(account: HoodAccount): string {
  return `HOOD_${account.toUpperCase()}`;
}

function normalizeHoodSnapshot(payload: Record<string, unknown>, account: HoodAccount, mainEan: string): CreateProductJvSourceSnapshot {
  const item = extractFirstItemFromPayload(payload.external_payload);
  const imageUrls = stringList(item?.images);
  const description = decodeHtmlEntities(asTrimmedString(item?.description));
  const productName = asTrimmedString(item?.title) || asTrimmedString(payload.items && Array.isArray(payload.items) ? payload.items[0]?.title : "") || mainEan;

  return {
    siteKey: hoodSiteKey(account),
    sourceProductId: null,
    ean: mainEan,
    price: asTrimmedString(item?.price),
    productName,
    description,
    shortDescription: stripHtml(description).slice(0, 255),
    imagesText: imageUrls.join("\n"),
    imageUrls,
    categories: [],
    hoodFields: {
      quantity: asTrimmedString(item?.quantity),
      categoryId: asTrimmedString(item?.categoryID),
      condition: asTrimmedString(item?.condition),
      itemMode: asTrimmedString(item?.itemMode),
      itemNumber: asTrimmedString(item?.itemNumber),
      productPropertiesText: hoodProductPropertiesText(item?.productProperties),
    },
    rawPayload: payload,
  };
}

export async function fetchCreateProductKidContext(kidId: number): Promise<CreateProductKidContext> {
  const [details, mainEan] = await Promise.all([
    fetchKidDetails(kidId),
    fetchKidMarketplaceMainEan(kidId),
  ]);

  if (!mainEan) {
    throw new Error("create_product_main_ean_missing");
  }

  return {
    kidId,
    kidNumber: details.kidNumber,
    mainEan,
    place: details.place,
    room: details.room,
    furnitureType: details.furnitureType,
    commentary: details.commentary,
  };
}

export async function fetchXlManufacturerOptions(siteKey = CREATE_PRODUCT_XL_DEFAULT_SITE_KEY): Promise<XlManufacturerOption[]> {
  const response = await apiFetch(
    `/api/v1/xl/manufacturers/?site_key=${encodeURIComponent(siteKey.trim() || CREATE_PRODUCT_XL_DEFAULT_SITE_KEY)}`,
  );
  const payload = (await response.json()) as { detail?: unknown; items?: unknown };
  if (!response.ok) {
    throw new Error(asTrimmedString(payload.detail) || `xl_manufacturers_http:${response.status}`);
  }
  return Array.isArray(payload.items)
    ? payload.items
        .map((item) => {
          const row = item as Record<string, unknown>;
          return {
            manufacturerId: asTrimmedString(row.manufacturer_id),
            name: asTrimmedString(row.name),
            deliveryTime: asTrimmedString(row.delivery_time),
          };
        })
        .filter((item) => item.manufacturerId && item.name)
    : [];
}

export async function fetchCreateProductJvSitesByMainEan(mainEan: string): Promise<CreateProductJvSourceSite[]> {
  if (!normalizeEanOrEmpty(mainEan)) {
    return [];
  }
  const { response, payload } = await xljvGetSitesByEan({ ean: mainEan, site: "JV" });
  if (!response.ok) {
    throw new Error(payload.detail || `create_product_jv_source_sites_http:${response.status}`);
  }
  return normalizeSourceSites(payload as { found?: Array<Record<string, unknown>> });
}

export async function fetchCreateProductSourceSitesByMainEan(input: {
  mainEan: string;
  site: CreateProductSourceSiteKind;
}): Promise<CreateProductJvSourceSite[]> {
  const normalizedMainEan = normalizeEanOrEmpty(input.mainEan);
  if (!normalizedMainEan) {
    return [];
  }

  if (input.site === "XL") {
    const { response, payload } = await xljvGetSitesByEan({ ean: normalizedMainEan, site: "XL" });
    if (!response.ok) {
      throw new Error(payload.detail || `create_product_xl_source_sites_http:${response.status}`);
    }
    return normalizeSourceSites(payload as { found?: Array<Record<string, unknown>> })
      .filter((site) => site.siteKey.trim().toUpperCase() === CREATE_PRODUCT_XL_DEFAULT_SITE_KEY);
  }

  if (input.site === "HOOD") {
    const results: Array<CreateProductJvSourceSite | null> = await Promise.all(["jv", "xl"].map(async (account) => {
      const { response, payload } = await fetchHoodByEan(normalizedMainEan, account as HoodAccount);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(asTrimmedString((payload as { detail?: unknown }).detail) || `create_product_hood_source_sites_http:${response.status}`);
      }
      const snapshot = normalizeHoodSnapshot(payload as Record<string, unknown>, account as HoodAccount, normalizedMainEan);
      return {
        siteKey: snapshot.siteKey,
        domain: "hood.de",
        productId: null,
        ean: normalizedMainEan,
        price: snapshot.price,
        title: snapshot.productName,
      };
    }));
    return results.filter((result): result is CreateProductJvSourceSite => Boolean(result));
  }

  if (input.site === "KAUFLAND") {
    const results: Array<CreateProductJvSourceSite | null> = await Promise.all(["jv", "xl"].map(async (account) => {
      const { response, payload } = await fetchKauflandByEan({ ean: normalizedMainEan, site: account as KauflandSite });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(asTrimmedString((payload as { detail?: unknown }).detail) || `create_product_kaufland_source_sites_http:${response.status}`);
      }
      const snapshot = normalizeKauflandSnapshot(payload as Record<string, unknown>, account as KauflandSite, normalizedMainEan);
      return {
        siteKey: snapshot.siteKey,
        domain: "kaufland.de",
        productId: null,
        ean: normalizedMainEan,
        price: snapshot.price,
        title: snapshot.productName,
      };
    }));
    return results.filter((result): result is CreateProductJvSourceSite => Boolean(result));
  }

  return fetchCreateProductJvSitesByMainEan(normalizedMainEan);
}

export async function fetchCreateProductJvSourceSnapshot(input: {
  mainEan: string;
  siteKey: string;
}): Promise<CreateProductJvSourceSnapshot> {
  const normalizedMainEan = normalizeEanOrEmpty(input.mainEan);
  if (!normalizedMainEan) {
    throw new Error("create_product_main_ean_empty");
  }
  const { response, payload } = await xljvGetProductByEan({
    ean: normalizedMainEan,
    site: "JV",
    siteKey: input.siteKey,
  });
  if (!response.ok) {
    throw new Error(payload.detail || `create_product_jv_source_product_http:${response.status}`);
  }

  const descriptions = Array.isArray(payload.descriptions) ? (payload.descriptions as DescriptionRow[]) : [];
  const primary = pickGermanLikeDescription(descriptions);
  const description = primary ? asTrimmedString(primary.description) : "";
  const shortDescription =
    typeof payload.jv_fields === "object" && payload.jv_fields !== null
      ? asTrimmedString((payload.jv_fields as Record<string, unknown>).kurzbeschreibung) ||
        asTrimmedString((payload.jv_fields as Record<string, unknown>).short_description_real)
      : "";
  const productName =
    (primary ? asTrimmedString(primary.name) : "") ||
    asTrimmedString(payload.source_model) ||
    asTrimmedString(payload.ean);
  const imageUrls = normalizeImageUrls(payload as Record<string, unknown>, input.siteKey);

  return {
    siteKey: input.siteKey,
    sourceProductId: asNumberOrNull(payload.source_product_id),
    ean: normalizeEanOrEmpty(asTrimmedString(payload.ean)),
    price: asTrimmedString(payload.price),
    productName,
    description,
    shortDescription: shortDescription || stripHtml(description).slice(0, 255),
    imagesText: imageUrls.join("\n"),
    imageUrls,
    categories: normalizeCategories(payload as Record<string, unknown>),
    rawPayload: payload as Record<string, unknown>,
  };
}

export async function fetchCreateProductSourceSnapshot(input: {
  mainEan: string;
  site: CreateProductSourceSiteKind;
  siteKey?: string;
}): Promise<CreateProductJvSourceSnapshot> {
  const normalizedMainEan = normalizeEanOrEmpty(input.mainEan);
  if (!normalizedMainEan) {
    throw new Error("Main EAN is empty.");
  }

  if (input.site === "XL") {
    const siteKey = (input.siteKey || CREATE_PRODUCT_XL_DEFAULT_SITE_KEY).trim() || CREATE_PRODUCT_XL_DEFAULT_SITE_KEY;
    const { response, payload } = await xljvGetProductByEan({
      ean: normalizedMainEan,
      site: "XL",
      siteKey,
    });
    if (!response.ok) {
      throw new Error(payload.detail || `XL source product request failed: HTTP ${response.status}`);
    }

    const descriptions = Array.isArray(payload.descriptions) ? (payload.descriptions as DescriptionRow[]) : [];
    const primary = pickGermanLikeDescription(descriptions);
    const description = primary ? asTrimmedString(primary.description) : "";
    const productName =
      (primary ? asTrimmedString(primary.name) : "") ||
      asTrimmedString(payload.source_model) ||
      asTrimmedString(payload.ean);
    const imageUrls = normalizeImageUrls(payload as Record<string, unknown>, siteKey);

    return {
      siteKey,
      sourceProductId: asNumberOrNull(payload.source_product_id),
      ean: normalizeEanOrEmpty(asTrimmedString(payload.ean)),
      price: asTrimmedString(payload.price),
      productName,
      description,
      shortDescription: stripHtml(description).slice(0, 255),
      imagesText: imageUrls.join("\n"),
      imageUrls,
      categories: normalizeCategories(payload as Record<string, unknown>),
      rawPayload: payload as Record<string, unknown>,
    };
  }

  if (input.site === "HOOD") {
    const account = hoodAccountFromSiteKey(input.siteKey);
    const { response, payload } = await fetchHoodByEan(normalizedMainEan, account);
    if (!response.ok) {
      throw new Error(asTrimmedString(payload.detail) || `Hood source product request failed: HTTP ${response.status}`);
    }
    return normalizeHoodSnapshot(payload as Record<string, unknown>, account, normalizedMainEan);
  }

  if (input.site === "KAUFLAND") {
    const account = kauflandAccountFromSiteKey(input.siteKey);
    const { response, payload } = await fetchKauflandByEan({ ean: normalizedMainEan, site: account });
    if (!response.ok) {
      throw new Error(asTrimmedString(payload.detail) || `Kaufland source product request failed: HTTP ${response.status}`);
    }
    return normalizeKauflandSnapshot(payload as Record<string, unknown>, account, normalizedMainEan);
  }

  return fetchCreateProductJvSourceSnapshot({
    mainEan: normalizedMainEan,
    siteKey: (input.siteKey || "").trim(),
  });
}
