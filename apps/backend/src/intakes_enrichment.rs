use sqlx::PgPool;
use tokio::time::{timeout, Duration};

use crate::{
    afterbuy::fetch_afterbuy_order_data, intakes_common::normalize_optional_text,
    intakes_image_lookup::find_product_image_url_by_sku,
    AfterbuyOrderItemDto, IntakeDto,
};

#[derive(Debug, Clone, Default)]
pub(crate) struct IntakeProductSnapshot {
    pub(crate) order_id: Option<String>,
    pub(crate) product_title: Option<String>,
    pub(crate) product_sku: Option<String>,
    pub(crate) product_ean: Option<String>,
    pub(crate) product_price: Option<String>,
    pub(crate) product_size: Option<String>,
    pub(crate) product_color: Option<String>,
    pub(crate) product_sale_date: Option<String>,
    pub(crate) order_memo: Option<String>,
}

pub(crate) fn extract_order_id_from_qr(qr_code: &str) -> Option<String> {
    let first = qr_code.split('|').next()?.trim();
    if first.is_empty() || first.len() > 64 {
        return None;
    }
    if !first
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    Some(first.to_string())
}

fn pick_order_item_for_product(
    items: &[AfterbuyOrderItemDto],
    product_key: Option<&str>,
) -> Option<AfterbuyOrderItemDto> {
    if items.is_empty() {
        return None;
    }

    if let Some(key) = product_key {
        let needle = key.trim().to_ascii_lowercase();
        if !needle.is_empty() {
            for item in items {
                let sku_match = item
                    .sku
                    .as_deref()
                    .unwrap_or_default()
                    .trim()
                    .eq_ignore_ascii_case(&needle);
                let ean_match = item
                    .ean
                    .as_deref()
                    .unwrap_or_default()
                    .trim()
                    .eq_ignore_ascii_case(&needle);
                let title_match = item.title.to_ascii_lowercase().contains(&needle);
                if sku_match || ean_match || title_match {
                    return Some(item.clone());
                }
            }
        }
    }

    items.first().cloned()
}

async fn build_intake_snapshot(qr_code: &str, product_key: Option<&str>) -> IntakeProductSnapshot {
    let Some(order_id) = extract_order_id_from_qr(qr_code) else {
        return IntakeProductSnapshot::default();
    };

    let response = match timeout(
        Duration::from_secs(8),
        fetch_afterbuy_order_data(&order_id, None),
    )
    .await
    {
        Ok(Ok(value)) => value,
        _ => {
            return IntakeProductSnapshot {
                order_id: Some(order_id),
                ..IntakeProductSnapshot::default()
            }
        }
    };

    let selected = pick_order_item_for_product(&response.order_items, product_key);
    IntakeProductSnapshot {
        order_id: Some(order_id),
        product_title: selected.as_ref().map(|v| v.title.trim().to_string()),
        product_sku: selected
            .as_ref()
            .and_then(|v| normalize_optional_text(v.sku.clone())),
        product_ean: selected
            .as_ref()
            .and_then(|v| normalize_optional_text(v.ean.clone())),
        product_price: selected
            .as_ref()
            .and_then(|v| normalize_optional_text(v.price.clone())),
        product_size: selected
            .as_ref()
            .and_then(|v| normalize_optional_text(v.size.clone())),
        product_color: selected
            .as_ref()
            .and_then(|v| normalize_optional_text(v.color.clone())),
        product_sale_date: selected
            .as_ref()
            .and_then(|v| normalize_optional_text(v.sale_date.clone())),
        order_memo: normalize_optional_text(response.memo),
    }
}

pub(crate) async fn enrich_intake_rows_by_internal_index(
    db: &PgPool,
    internal_index: &str,
    qr_code: &str,
    product_key: Option<&str>,
) -> Result<Vec<IntakeDto>, String> {
    let snapshot = build_intake_snapshot(qr_code, product_key).await;
    let photo_url = if snapshot.product_sku.is_some() || product_key.is_some() {
        let sku_for_lookup = snapshot.product_sku.as_deref().or(product_key);
        find_product_image_url_by_sku(sku_for_lookup).await
    } else {
        None
    };

    sqlx::query(
        r#"
        UPDATE intakes
        SET
            order_id = COALESCE($1, order_id),
            product_title = COALESCE($2, product_title),
            product_sku = COALESCE($3, product_sku),
            product_ean = COALESCE($4, product_ean),
            product_price = COALESCE($5, product_price),
            product_size = COALESCE($6, product_size),
            product_color = COALESCE(product_color, $7),
            product_sale_date = COALESCE($8, product_sale_date),
            order_memo = COALESCE($9, order_memo),
            photo_url = COALESCE(photo_url, $10)
        WHERE internal_index = $11
        "#,
    )
    .bind(&snapshot.order_id)
    .bind(&snapshot.product_title)
    .bind(&snapshot.product_sku)
    .bind(&snapshot.product_ean)
    .bind(&snapshot.product_price)
    .bind(&snapshot.product_size)
    .bind(&snapshot.product_color)
    .bind(&snapshot.product_sale_date)
    .bind(&snapshot.order_memo)
    .bind(&photo_url)
    .bind(internal_index)
    .execute(db)
    .await
    .map_err(|e| format!("sql update failed: {e}"))?;

    let mut updated_rows = sqlx::query_as::<_, IntakeDto>(
        r#"
        SELECT
            id, qr_code, warehouse_location, kid_number, photo_url, product_key,
            category_main, category_sub, is_b_ware, b_ware_comment,
            section, slot_number, box_index, box_total, unit_index,
            internal_index,
            order_id, product_title, product_sku, product_ean, product_price,
            product_size, product_color, product_sale_date, order_memo,
            created_at, is_removed, removed_at
        FROM intakes
        WHERE internal_index = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(internal_index)
    .fetch_all(db)
    .await
    .map_err(|e| format!("failed to fetch enriched rows: {e}"))?;

    hydrate_intake_activity_many(&mut updated_rows);
    Ok(updated_rows)
}

pub(crate) fn hydrate_intake_activity(intake: &mut IntakeDto) {
    intake.is_active = !intake.is_removed;
}

pub(crate) fn hydrate_intake_activity_many(intakes: &mut [IntakeDto]) {
    for intake in intakes {
        hydrate_intake_activity(intake);
    }
}

pub(crate) async fn purge_expired_inactive_intakes(db: &PgPool) -> Result<u64, sqlx::Error> {
    let done = sqlx::query(
        r#"
        DELETE FROM intakes
        WHERE is_removed = TRUE
          AND removed_at IS NOT NULL
          AND removed_at <= NOW() - INTERVAL '30 days'
        "#,
    )
    .execute(db)
    .await?;
    Ok(done.rows_affected())
}
