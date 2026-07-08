export type AuthUser = {
  id: string;
  username: string;
  login: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  avatar_url?: string | null;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
};

export type PendingUser = {
  id: string;
  username: string;
  login: string;
  email: string | null;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export type AdminUser = {
  id: string;
  username: string;
  login: string;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
  approved_by?: string | null;
  approved_by_login?: string | null;
};

export type AdminUsersQueryParams = {
  limit?: number;
  offset?: number;
  search?: string;
  role?: "all" | "admin" | "user";
  status?: "all" | "pending" | "approved" | "rejected";
  sort?: "newest" | "oldest";
};

export type TelegramAccessStatus = "pending" | "approved" | "revoked";

export type TelegramAccessEntry = {
  id: number;
  telegram_user_id: number;
  chat_id: number;
  thread_key: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  app_user: {
    id: string | null;
    username: string | null;
    login: string | null;
    email: string | null;
  };
  status: TelegramAccessStatus;
  requested_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TelegramAccessQueryParams = {
  search?: string;
  status?: "all" | TelegramAccessStatus;
  sort?: "newest" | "oldest";
};

export type IntakeDeleteAuditQueryParams = {
  limit?: number;
  actor_login?: string;
  request_id?: string;
  section?: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "M";
  from?: string;
  to?: string;
};

export type IntakeDeleteAuditEntry = {
  timestamp: string;
  event: "intake_delete_by_id" | "intake_delete_by_location" | string;
  request_id: string;
  actor_login: string;
  section: string | null;
  slot_number: number | null;
  warehouse_location: string | null;
  intake_id: string | null;
  mode: string | null;
  removed_count: number | null;
};

export type IntakesQueryParams = {
  limit?: number;
  offset?: number;
  search?: string;
  section?: "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "M";
  activity?: "active" | "inactive" | "all";
};

export type IntakeDto = {
  id: string;
  qr_code: string;
  warehouse_location: string;
  kid_number: string;
  photo_url: string | null;
  product_key: string | null;
  section: string;
  slot_number: number;
  box_index: number;
  box_total: number;
  unit_index: number;
  internal_index: string | null;
  order_id: string | null;
  product_title: string | null;
  product_sku: string | null;
  product_ean: string | null;
  product_price: string | null;
  product_size: string | null;
  product_color: string | null;
  is_b_ware: boolean;
  b_ware_comment: string | null;
  category_main: string | null;
  category_sub: string | null;
  product_sale_date: string | null;
  order_memo: string | null;
  created_at: string;
  is_removed: boolean;
  is_active?: boolean;
  removed_at?: string | null;
};

export type AfterbuyOrderData = {
  order_id: string;
  account: string;
  url: string;
  final_url: string;
  http_status: number;
  page_title: string | null;
  login_required: boolean;
  relogin_performed: boolean;
  page_preview: string;
  page_html: string;
  memo: string | null;
  order_items: Array<{
    article_no: string | null;
    sku: string | null;
    ean: string | null;
    title: string;
    size: string | null;
    color: string | null;
    price: string | null;
    sale_date: string | null;
    quantity: number;
  }>;
};

export type AfterbuyKidOrderMatch = {
  order_id: string;
  title: string;
};

export type AfterbuyKidOrdersData = {
  kid_number: string;
  account: string;
  url: string;
  final_url: string;
  http_status: number;
  page_title: string | null;
  login_required: boolean;
  relogin_performed: boolean;
  page_preview: string;
  matches: AfterbuyKidOrderMatch[];
};

export type ProductDraft = {
  title: string;
  ean: string;
  price: string;
  size: string;
  color: string;
};

export type CreateIntakePayload = {
  qr_code: string;
  kid_number: string;
  warehouse_location?: string;
  photo_url?: string;
  product_key?: string;
  category_main?: string;
  category_sub?: string;
  is_b_ware?: boolean;
  b_ware_comment?: string;
  box_total?: number;
  placement_strategy?: string;
};

export type UpdateProfilePayload = {
  email?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  avatar_url?: string | null;
};

export type ChangePasswordPayload = {
  current_password: string;
  new_password: string;
};

export type ChangePasswordCodeConfirmPayload = {
  current_password: string;
  new_password: string;
  code: string;
};
