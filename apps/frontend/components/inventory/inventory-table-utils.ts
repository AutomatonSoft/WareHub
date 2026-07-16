export type KidDto = {
  id: string;
  entity: "order" | "kid";
  kid_id: number;
  kid_number: string;
  kid_account?: string | null;
  order_db_id?: number | null;
  order_id?: string | null;
  parent_order_id?: string | null;
  additional_order_ids_text?: string | null;
  place?: string | string[] | null;
  buyer?: string | null;
  store?: boolean | null;
  platform?: string | null;
  quantity?: number | null;
  room?: string | null;
  type?: string | null;
  sku?: string | null;
  title: string;
  memo?: string | null;
  status: "paid" | "no_paid" | string;
  order_date?: string | null;
  full_amount?: string | null;
  global_price?: string | null;
  photo?: unknown;
  photo_count?: number | null;
};

export type InventoryRow = {
  id: string;
  kidNumber: string;
  kidAccount: string;
  kidId: number;
  orderDbId: number | null;
  entity: "order" | "kid";
  orderId: string;
  buyer: string;
  additionalOrderIds: string;
  platform: string;
  title: string;
  memo: string;
  sku: string;
  fullAmount: string;
  status: string;
  orderDate: string;
  photo: string;
  photos: string[];
  photoCount: string;
};

export function formatDate(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
}

export function statusTone(status: string): "success" | "warning" {
  return status === "paid" ? "success" : "warning";
}

export function normalizePhotoList(photo: unknown): string[] {
  if (Array.isArray(photo)) {
    return photo
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (typeof photo === "string") {
    const single = photo.trim();
    return single ? [single] : [];
  }
  return [];
}

export function getPrimaryPhoto(photo: unknown): string {
  const photos = normalizePhotoList(photo);
  return photos[0] ?? "-";
}

export function normalizePlaceValue(place: unknown): string {
  if (Array.isArray(place)) {
    const normalized = place
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return normalized.length > 0 ? normalized.join(", ") : "-";
  }
  if (typeof place === "string") {
    const trimmed = place.trim();
    return trimmed.length > 0 ? trimmed : "-";
  }
  return "-";
}

export function compactText(value: string, max: number): string {
  if (value === "-" || value.length <= max) {
    return value;
  }
  return `${value.slice(0, max).trimEnd()}...`;
}

export function formatPriceWithoutDots(value: string): string {
  if (value === "-") {
    return value;
  }
  return value.replace(/\./g, "");
}

