use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub(crate) struct AfterbuyOrderQuery {
    pub(crate) account: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AfterbuyKidQuery {
    pub(crate) account: Option<String>,
    pub(crate) debug: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct AfterbuyOrderResponse {
    pub(crate) order_id: String,
    pub(crate) account: String,
    pub(crate) url: String,
    pub(crate) final_url: String,
    pub(crate) http_status: u16,
    pub(crate) page_title: Option<String>,
    pub(crate) login_required: bool,
    pub(crate) relogin_performed: bool,
    pub(crate) page_preview: String,
    pub(crate) page_html: String,
    pub(crate) memo: Option<String>,
    pub(crate) order_items: Vec<AfterbuyOrderItemDto>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct AfterbuyKidOrderMatchDto {
    pub(crate) order_id: String,
    pub(crate) title: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct AfterbuyKidOrdersResponse {
    pub(crate) kid_number: String,
    pub(crate) account: String,
    pub(crate) url: String,
    pub(crate) final_url: String,
    pub(crate) http_status: u16,
    pub(crate) page_title: Option<String>,
    pub(crate) login_required: bool,
    pub(crate) relogin_performed: bool,
    pub(crate) page_preview: String,
    pub(crate) matches: Vec<AfterbuyKidOrderMatchDto>,
    pub(crate) debug: Option<AfterbuyKidDebugDto>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct AfterbuyKidDebugDto {
    pub(crate) html_length: usize,
    pub(crate) has_seller_overview_row: bool,
    pub(crate) has_data_row_item_id: bool,
    pub(crate) has_art_edit_id: bool,
    pub(crate) has_iframe: bool,
    pub(crate) first_iframe_src: Option<String>,
    pub(crate) html_sample: String,
    pub(crate) html_tail_sample: String,
    pub(crate) kid_occurrences: usize,
    pub(crate) candidate_urls: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct AfterbuyOrderItemDto {
    pub(crate) article_no: Option<String>,
    pub(crate) sku: Option<String>,
    pub(crate) ean: Option<String>,
    pub(crate) title: String,
    pub(crate) size: Option<String>,
    pub(crate) color: Option<String>,
    pub(crate) price: Option<String>,
    pub(crate) sale_date: Option<String>,
    pub(crate) quantity: i32,
}
