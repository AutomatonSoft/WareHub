use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::{IntakeDto, IntakeProductSnapshot};

pub(crate) struct InsertIntakeRowInput<'a> {
    pub(crate) intake_id: Uuid,
    pub(crate) qr_code: &'a str,
    pub(crate) warehouse_location: &'a str,
    pub(crate) kid_number: &'a str,
    pub(crate) photo_url: &'a Option<String>,
    pub(crate) product_key: &'a Option<String>,
    pub(crate) category_main: &'a Option<String>,
    pub(crate) category_sub: &'a Option<String>,
    pub(crate) is_b_ware: bool,
    pub(crate) b_ware_comment: &'a Option<String>,
    pub(crate) section: &'a str,
    pub(crate) slot_number: i32,
    pub(crate) box_index: i32,
    pub(crate) box_total: i32,
    pub(crate) unit_index: i32,
    pub(crate) internal_index: &'a str,
    pub(crate) snapshot: &'a IntakeProductSnapshot,
}

pub(crate) async fn insert_intake_row(
    tx: &mut Transaction<'_, Postgres>,
    input: InsertIntakeRowInput<'_>,
) -> Result<IntakeDto, sqlx::Error> {
    sqlx::query_as::<_, IntakeDto>(
        r#"
        INSERT INTO intakes (
            id, qr_code, warehouse_location, kid_number, photo_url, product_key,
            category_main, category_sub, is_b_ware, b_ware_comment,
            section, slot_number, box_index, box_total, unit_index, is_removed,
            internal_index,
            order_id, product_title, product_sku, product_ean, product_price,
            product_size, product_color, product_sale_date, order_memo
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
        )
        RETURNING
            id, qr_code, warehouse_location, kid_number, photo_url, product_key,
            category_main, category_sub, is_b_ware, b_ware_comment,
            section, slot_number, box_index, box_total, unit_index,
            internal_index,
            order_id, product_title, product_sku, product_ean, product_price,
            product_size, product_color, product_sale_date, order_memo,
            created_at, is_removed, removed_at
        "#,
    )
    .bind(input.intake_id)
    .bind(input.qr_code)
    .bind(input.warehouse_location)
    .bind(input.kid_number)
    .bind(input.photo_url)
    .bind(input.product_key)
    .bind(input.category_main)
    .bind(input.category_sub)
    .bind(input.is_b_ware)
    .bind(input.b_ware_comment)
    .bind(input.section)
    .bind(input.slot_number)
    .bind(input.box_index)
    .bind(input.box_total)
    .bind(input.unit_index)
    .bind(false)
    .bind(input.internal_index)
    .bind(&input.snapshot.order_id)
    .bind(&input.snapshot.product_title)
    .bind(&input.snapshot.product_sku)
    .bind(&input.snapshot.product_ean)
    .bind(&input.snapshot.product_price)
    .bind(&input.snapshot.product_size)
    .bind(&input.snapshot.product_color)
    .bind(&input.snapshot.product_sale_date)
    .bind(&input.snapshot.order_memo)
    .fetch_one(&mut **tx)
    .await
}
