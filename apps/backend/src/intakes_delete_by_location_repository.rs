use sqlx::{Postgres, Transaction};

use crate::IntakeDto;

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct OldestActiveIntakeSeed {
    pub(crate) section: String,
    pub(crate) slot_number: i32,
    pub(crate) unit_index: i32,
    pub(crate) internal_index: Option<String>,
    pub(crate) qr_code: String,
    pub(crate) kid_number: String,
    pub(crate) product_key: Option<String>,
    pub(crate) is_b_ware: bool,
}

#[derive(Debug)]
pub(crate) struct UnitGroupKey<'a> {
    pub(crate) section: &'a str,
    pub(crate) slot_number: i32,
    pub(crate) unit_index: i32,
    pub(crate) qr_code: &'a str,
    pub(crate) kid_number: &'a str,
    pub(crate) product_key: Option<&'a str>,
    pub(crate) is_b_ware: bool,
}

pub(crate) async fn fetch_oldest_active_intake_seed_for_location(
    tx: &mut Transaction<'_, Postgres>,
    section: &str,
    slot_number: i32,
) -> Result<Option<OldestActiveIntakeSeed>, sqlx::Error> {
    sqlx::query_as::<_, OldestActiveIntakeSeed>(
        r#"
        SELECT
            section,
            slot_number,
            unit_index,
            internal_index,
            qr_code,
            kid_number,
            product_key,
            is_b_ware
        FROM intakes
        WHERE is_removed = FALSE
          AND section = $1
          AND slot_number = $2
        ORDER BY created_at ASC, box_index ASC, id ASC
        LIMIT 1
        "#,
    )
    .bind(section)
    .bind(slot_number)
    .fetch_optional(&mut **tx)
    .await
}

pub(crate) async fn soft_delete_active_unit_group_by_internal_index(
    tx: &mut Transaction<'_, Postgres>,
    internal_index: &str,
) -> Result<Vec<IntakeDto>, sqlx::Error> {
    sqlx::query_as::<_, IntakeDto>(
        r#"
        UPDATE intakes
        SET is_removed = TRUE,
            removed_at = NOW()
        WHERE is_removed = FALSE
          AND internal_index = $1
        RETURNING
            id, qr_code, warehouse_location, kid_number, photo_url, product_key,
            category_main, category_sub, is_b_ware, b_ware_comment,
            section, slot_number, box_index, box_total, unit_index,
            internal_index,
            order_id, product_title, product_sku, product_ean, product_price,
            product_size, product_color, product_sale_date, order_memo,
            created_at, is_removed, removed_at,
            (NOT is_removed) AS is_active
        "#,
    )
    .bind(internal_index)
    .fetch_all(&mut **tx)
    .await
}

pub(crate) async fn soft_delete_active_unit_group_by_key(
    tx: &mut Transaction<'_, Postgres>,
    key: &UnitGroupKey<'_>,
) -> Result<Vec<IntakeDto>, sqlx::Error> {
    sqlx::query_as::<_, IntakeDto>(
        r#"
        UPDATE intakes
        SET is_removed = TRUE,
            removed_at = NOW()
        WHERE is_removed = FALSE
          AND section = $1
          AND slot_number = $2
          AND unit_index = $3
          AND qr_code = $4
          AND kid_number = $5
          AND (
            ($6::TEXT IS NULL AND product_key IS NULL)
            OR product_key = $6
          )
          AND is_b_ware = $7
        RETURNING
            id, qr_code, warehouse_location, kid_number, photo_url, product_key,
            category_main, category_sub, is_b_ware, b_ware_comment,
            section, slot_number, box_index, box_total, unit_index,
            internal_index,
            order_id, product_title, product_sku, product_ean, product_price,
            product_size, product_color, product_sale_date, order_memo,
            created_at, is_removed, removed_at,
            (NOT is_removed) AS is_active
        "#,
    )
    .bind(key.section)
    .bind(key.slot_number)
    .bind(key.unit_index)
    .bind(key.qr_code)
    .bind(key.kid_number)
    .bind(key.product_key)
    .bind(key.is_b_ware)
    .fetch_all(&mut **tx)
    .await
}

#[cfg(test)]
mod tests {
    use super::UnitGroupKey;

    #[test]
    fn unit_group_key_allows_missing_product_key() {
        let key = UnitGroupKey {
            section: "C",
            slot_number: 20,
            unit_index: 7,
            qr_code: "QR",
            kid_number: "K1",
            product_key: None,
            is_b_ware: false,
        };
        assert!(key.product_key.is_none());
        assert_eq!(key.slot_number, 20);
    }
}
