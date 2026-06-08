export type RawAdditionalItem = {
  order_id?: string;
  platform?: string;
  buyer?: string;
  title?: string;
  sku?: string;
  memo?: string;
  verkaufsdatum?: string;
  zahlungssumme?: string;
  rechnungssumme?: string;
  article_number_2?: string;
  auction_group?: string;
};

export type InventoryApiRow = {
  id: string;
  entity: "order" | "kid";
  kid_id: number;
  kid_number: string;
  kid_account?: string | null;
  place?: string | null;
  room?: string | null;
  type?: string | null;
  listing_status?: string | null;
  photo?: unknown;
  order_db_id?: number | null;
  parent_order_id?: string | null;
  additional_order_ids_text?: string | null;
  additional_items?: RawAdditionalItem[] | null;
  platform?: string | null;
  quantity?: number | null;
  title?: string | null;
  memo?: string | null;
  sku?: string | null;
  global_price?: string | null;
  status?: string | null;
  date?: string | null;
  sku_eans?: string[] | null;
  linked_products_by_ean?: {
    xljv_services?: Record<string, unknown[]>;
    hood_service?: Record<string, unknown[]>;
  } | null;
};

export type InventoryRowsApiResponse =
  | InventoryApiRow[]
  | {
      results?: InventoryApiRow[];
    };

export type ParentOrderRow = {
  id: string;
  orderDbId: number;
  parentOrderId: string;
  additionalOrderIdsText: string;
  platform: string;
  quantity: string;
  title: string;
  memo: string;
  sku: string;
  globalPrice: string;
  status: string;
  date: string;
  additionalItems: RawAdditionalItem[];
};

export type ChildOrderRow = {
  orderId: string;
  platform: string;
  buyer: string;
  title: string;
  sku: string;
  memo: string;
  orderDate: string;
  payment: string;
  invoice: string;
};

export type KidMeta = {
  kidNumber: string;
  kidAccount: string;
  place: string;
  room: string;
  furnitureType: string;
  listingStatus: string;
  gallery: ReturnType<typeof import("../image-gallery-model").buildKidImageGalleryModel>;
  photos: string[];
  skuEans: string[];
  linkedProductsByEan: {
    xljv_services?: Record<string, unknown[]>;
    hood_service?: Record<string, unknown[]>;
  };
  orderIds: string[];
  skuEanCount: number;
  listingSummary: {
    xljv_services: { total: number; sites: string[]; source_product_ids: string[] };
    hood_service: { total: number; accounts: string[] };
  };
};

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

export function statusTone(status: string): "success" | "warning" {
  return status === "paid" ? "success" : "warning";
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function formatPriceWithoutDots(value: string): string {
  if (!value || value === "-") return "-";
  return value.replace(/\./g, "");
}

