"use client";

export type ProductEditorGroupId = "JV" | "XL" | "HOOD" | "OTTO" | "KAUFLAND" | "EBAY";
export type ProductEditorTargetType = "source_site" | "marketplace_account";
export type ProductEditorTargetStatus =
  | "unknown"
  | "found"
  | "missing"
  | "error"
  | "planned"
  | "unsupported"
  | "read_only";
export type ProductEditorRiskLevel = "low" | "medium" | "high";

export type ProductEditorCapability = {
  discover: boolean;
  load: boolean;
  plan: boolean;
  apply: boolean;
  job_status: boolean;
};

export type ProductEditorWarning = {
  code: string;
  message: string;
  level: ProductEditorRiskLevel;
};

export type ProductEditorTarget = {
  id: string;
  label: string;
  group: ProductEditorGroupId;
  target_type: ProductEditorTargetType;
  account_family: string | null;
  country: string | null;
  baseline_eligible: boolean;
  auto_baseline_eligible: boolean;
  selected_by_default: boolean;
  read_only: boolean;
  planned: boolean;
  unsupported: boolean;
  status: ProductEditorTargetStatus;
  capabilities: ProductEditorCapability;
  warnings: ProductEditorWarning[];
  metadata: Record<string, unknown>;
};

export type ProductEditorGroup = {
  id: ProductEditorGroupId;
  label: string;
  description: string;
  capabilities: ProductEditorCapability;
  read_only: boolean;
  planned: boolean;
  unsupported: boolean;
  targets: ProductEditorTarget[];
};

export type ProductEditorDiscoverResponse = {
  request_id: string;
  ean: string;
  groups: ProductEditorGroup[];
  recommended_baseline_target_id: string | null;
  selected_group_id: ProductEditorGroupId;
  selected_target_ids: string[];
  warnings: ProductEditorWarning[];
};

export type ProductEditorHoodProperty = {
  name: string;
  value: string;
};

export type ProductEditorHoodDraft = {
  target_id: string;
  account: "jv" | "xl";
  ean: string;
  item_id: string;
  title: string;
  description: string;
  price: string;
  quantity: string;
  categoryID: string;
  condition: string;
  itemMode: string;
  itemNumber: string;
  image: string;
  images: string[];
  productProperties: ProductEditorHoodProperty[];
  raw_payload: Record<string, unknown>;
  pending_uploads: ProductEditorPendingUpload[];
};

export type ProductEditorJvDescription = {
  language_id: number;
  name: string;
  description: string;
  tag?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keyword?: string;
};

export type ProductEditorJvCategory = {
  category_id: number;
  main_category?: boolean;
};

export type ProductEditorJvSiteKey = "JV_DE" | "JV_CO_UK" | "JV_CH" | "JV_AT";

export type ProductEditorJvCategoriesBySiteKey = Partial<Record<ProductEditorJvSiteKey, ProductEditorJvCategory[]>>;

export type ProductEditorJvFieldsBySiteKey = Partial<Record<ProductEditorJvSiteKey, Record<string, unknown>>>;

export type ProductEditorJvImage = {
  image: string;
  public_url?: string;
  sort_order?: number;
};

export type ProductEditorJvDraft = {
  target_id: string;
  ean: string;
  source_model: string;
  source_sku: string;
  source_ean_field: string;
  price: string;
  quantity: string;
  status: boolean;
  image: string;
  image_public_url: string;
  descriptions: ProductEditorJvDescription[];
  categories: ProductEditorJvCategory[];
  categories_by_site_key: ProductEditorJvCategoriesBySiteKey;
  images: ProductEditorJvImage[];
  jv_fields: Record<string, unknown>;
  jv_fields_by_site_key: ProductEditorJvFieldsBySiteKey;
  pending_uploads: ProductEditorPendingUpload[];
};

export type ProductEditorPendingUpload = {
  id: string;
  name: string;
  size: number;
  type: string;
  preview_url?: string;
  file?: File;
};

export type ProductEditorLoadResponse = {
  request_id: string;
  ean: string;
  active_group: ProductEditorGroupId;
  baseline_target_id: string | null;
  draft: Omit<ProductEditorHoodDraft, "pending_uploads" | "quantity"> & {
    quantity: number | null;
  };
  supported: boolean;
  warnings: ProductEditorWarning[];
};

export type ProductEditorApiError = {
  code: string;
  message: string;
  request_id: string;
  details: Record<string, unknown>;
};

export type ProductEditorJobStatus = "queued" | "running" | "completed" | "failed";

export type ProductEditorPlanResponse = {
  request_id: string;
  plan_id: string;
  ean: string;
  active_group: ProductEditorGroupId;
  targets: ProductEditorTarget[];
  changed_fields: string[];
  warnings: ProductEditorWarning[];
  risk_level: ProductEditorRiskLevel;
  summary: Record<string, unknown>;
};

export type ProductEditorApplyResponse = {
  request_id: string;
  job_id: string;
  status: ProductEditorJobStatus;
  active_group: ProductEditorGroupId;
  accepted: boolean;
};

export type ProductEditorJobTargetResult = {
  target_id: string;
  status: "success" | "failed";
  status_code: number;
  data?: Record<string, unknown>;
  error?: ProductEditorApiError;
};

export type ProductEditorJobResponse = {
  request_id: string;
  job_id: string;
  status: ProductEditorJobStatus;
  active_group: ProductEditorGroupId | null;
  summary: Record<string, unknown>;
  targets: ProductEditorJobTargetResult[];
  error: ProductEditorApiError | null;
};
