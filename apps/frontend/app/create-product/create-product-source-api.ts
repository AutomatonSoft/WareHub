import {
  fetchKidDetails,
  getServicesApiBase,
} from "../../components/inventory/inventory-api";
import {
  xljvGetProductByEan,
  xljvGetSitesByEan,
} from "../../components/xljv/xljv-api";
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
  rawPayload: Record<string, unknown>;
};

export type CreateProductSourceSiteKind = "JV" | "XL";
export const CREATE_PRODUCT_XL_DEFAULT_SITE_KEY = "XLMOEBEL_DE";

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
    return "";
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

function normalizeImageUrls(payload: Record<string, unknown>, siteKey: string): string[] {
  const urls: string[] = [];
  const mainImage = asTrimmedString(payload.image_public_url) || asTrimmedString(payload.image);
  if (mainImage) urls.push(toAbsoluteImageUrl(mainImage, siteKey));

  const gallery = Array.isArray(payload.images_public_urls) ? payload.images_public_urls : [];
  for (const row of gallery) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const url = asTrimmedString(record.public_url) || asTrimmedString(record.image);
    if (url) urls.push(toAbsoluteImageUrl(url, siteKey));
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

export async function fetchCreateProductKidContext(kidId: number): Promise<CreateProductKidContext> {
  const [details, mainEan] = await Promise.all([
    fetchKidDetails(kidId),
    fetchKidMarketplaceMainEan(kidId),
  ]);

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

export async function fetchCreateProductJvSitesByMainEan(mainEan: string): Promise<CreateProductJvSourceSite[]> {
  if (!normalizeEanOrEmpty(mainEan)) {
    return [];
  }
  const { response, payload } = await xljvGetSitesByEan({ ean: mainEan, site: "JV" });
  if (!response.ok) {
    throw new Error(payload.detail || `JV source sites request failed: HTTP ${response.status}`);
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
    return [
      {
        siteKey: CREATE_PRODUCT_XL_DEFAULT_SITE_KEY,
        domain: "xlmoebel.de",
        productId: null,
        ean: normalizedMainEan,
        price: "",
        title: "",
      },
    ];
  }

  return fetchCreateProductJvSitesByMainEan(normalizedMainEan);
}

export async function fetchCreateProductJvSourceSnapshot(input: {
  mainEan: string;
  siteKey: string;
}): Promise<CreateProductJvSourceSnapshot> {
  const normalizedMainEan = normalizeEanOrEmpty(input.mainEan);
  if (!normalizedMainEan) {
    throw new Error("Main EAN is empty.");
  }
  const { response, payload } = await xljvGetProductByEan({
    ean: normalizedMainEan,
    site: "JV",
    siteKey: input.siteKey,
  });
  if (!response.ok) {
    throw new Error(payload.detail || `JV source product request failed: HTTP ${response.status}`);
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

  return fetchCreateProductJvSourceSnapshot({
    mainEan: normalizedMainEan,
    siteKey: (input.siteKey || "").trim(),
  });
}
