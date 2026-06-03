export type KidEanSummaryModel = {
  kidId: number;
  kidNumber: string;
  orderIds: string[];
  orderCount: number;
  skuEans: string[];
  skuEanCount: number;
  hasEan: boolean;
  linkedProductsByEan: {
    xljv_services: Record<string, unknown[]>;
    hood_service: Record<string, unknown[]>;
  };
  listingSummary: {
    xljv_services: { total: number; sites: string[]; source_product_ids: string[] };
    hood_service: { total: number; accounts: string[] };
  };
  kidSnapshot: {
    place: string;
    room: string;
    furnitureType: string;
    listingStatus: string;
    mainPhoto: string;
    photoCount: number;
    lastUpdate: string;
  };
};

type RawKidEanSummaryPayload = {
  kid_id?: unknown;
  kid_number?: unknown;
  order_ids?: unknown;
  order_count?: unknown;
  sku_eans?: unknown;
  sku_ean_count?: unknown;
  has_ean?: unknown;
  linked_products_by_ean?: unknown;
  listing_summary?: unknown;
  kid_snapshot?: unknown;
};

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asRecordOfArray(value: unknown): Record<string, unknown[]> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  const result: Record<string, unknown[]> = {};
  for (const [key, raw] of Object.entries(record)) {
    result[key] = Array.isArray(raw) ? raw : [];
  }
  return result;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => asString(item)).filter(Boolean);
}

export function normalizeKidEanSummaryPayload(payload: unknown, fallbackKidId: number): KidEanSummaryModel {
  const raw = asRecord(payload) as RawKidEanSummaryPayload | null;
  const linked = asRecord(raw?.linked_products_by_ean);
  const kidIdValue = Number.isFinite(Number(raw?.kid_id)) ? Number(raw?.kid_id) : fallbackKidId;
  const eans = Array.isArray(raw?.sku_eans)
    ? raw?.sku_eans.map((value) => asString(value)).filter(Boolean)
    : [];

  const listingSummary = asRecord(raw?.listing_summary);
  const listingXlJv = asRecord(listingSummary?.xljv_services);
  const listingHood = asRecord(listingSummary?.hood_service);
  const kidSnapshot = asRecord(raw?.kid_snapshot);

  return {
    kidId: kidIdValue,
    kidNumber: asString(raw?.kid_number),
    orderIds: asStringArray(raw?.order_ids),
    orderCount: Number.isFinite(Number(raw?.order_count)) ? Number(raw?.order_count) : 0,
    skuEans: Array.from(new Set(eans)),
    skuEanCount: Number.isFinite(Number(raw?.sku_ean_count)) ? Number(raw?.sku_ean_count) : eans.length,
    hasEan: Boolean(raw?.has_ean ?? eans.length > 0),
    linkedProductsByEan: {
      xljv_services: asRecordOfArray(linked?.xljv_services),
      hood_service: asRecordOfArray(linked?.hood_service),
    },
    listingSummary: {
      xljv_services: {
        total: Number.isFinite(Number(listingXlJv?.total)) ? Number(listingXlJv?.total) : 0,
        sites: asStringArray(listingXlJv?.sites),
        source_product_ids: asStringArray(listingXlJv?.source_product_ids),
      },
      hood_service: {
        total: Number.isFinite(Number(listingHood?.total)) ? Number(listingHood?.total) : 0,
        accounts: asStringArray(listingHood?.accounts),
      },
    },
    kidSnapshot: {
      place: asString(kidSnapshot?.place),
      room: asString(kidSnapshot?.room),
      furnitureType: asString(kidSnapshot?.furniture_type),
      listingStatus: asString(kidSnapshot?.listing_status, "unlisted"),
      mainPhoto: asString(kidSnapshot?.main_photo),
      photoCount: Number.isFinite(Number(kidSnapshot?.photo_count)) ? Number(kidSnapshot?.photo_count) : 0,
      lastUpdate: asString(kidSnapshot?.last_update),
    },
  };
}
