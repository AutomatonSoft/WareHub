function asString(value, fallback = "") {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function asRecord(value) {
  return typeof value === "object" && value !== null ? value : null;
}

function asRecordOfArray(value) {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  const result = {};
  for (const [key, raw] of Object.entries(record)) {
    result[key] = Array.isArray(raw) ? raw : [];
  }
  return result;
}

function asStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => asString(item)).filter(Boolean);
}

export function normalizeKidEanSummaryPayload(payload, fallbackKidId) {
  const raw = asRecord(payload);
  const linked = asRecord(raw?.linked_products_by_ean);
  const kidIdValue = Number.isFinite(Number(raw?.kid_id)) ? Number(raw?.kid_id) : fallbackKidId;
  const eans = Array.isArray(raw?.sku_eans)
    ? raw.sku_eans.map((value) => asString(value)).filter(Boolean)
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
      mainPhoto: asString(kidSnapshot?.main_photo),
      photoCount: Number.isFinite(Number(kidSnapshot?.photo_count)) ? Number(kidSnapshot?.photo_count) : 0,
      lastUpdate: asString(kidSnapshot?.last_update),
    },
  };
}
