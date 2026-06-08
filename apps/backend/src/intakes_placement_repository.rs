use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};

use crate::intakes_placement::ExistingPlacementDto;

pub(crate) async fn fetch_existing_product_location_row(
    db: &PgPool,
    product_key: &str,
) -> Result<Option<ExistingPlacementDto>, sqlx::Error> {
    sqlx::query_as::<_, ExistingPlacementDto>(
        r#"
        SELECT
            section,
            slot_number,
            warehouse_location,
            COUNT(DISTINCT unit_index) as units
        FROM intakes
        WHERE is_removed = FALSE AND product_key = $1
        GROUP BY section, slot_number, warehouse_location
        ORDER BY units DESC, slot_number ASC
        LIMIT 1
        "#,
    )
    .bind(product_key)
    .fetch_optional(db)
    .await
}

pub(crate) async fn fetch_max_unit_index_by_product_key(
    db: &PgPool,
    product_key: &str,
) -> Result<Option<i32>, sqlx::Error> {
    let row: Option<(Option<i32>,)> = sqlx::query_as(
        r#"
        SELECT MAX(unit_index)::INT
        FROM intakes
        WHERE is_removed = FALSE AND product_key = $1
        "#,
    )
    .bind(product_key)
    .fetch_optional(db)
    .await?;
    Ok(row.and_then(|(max_unit,)| max_unit))
}

pub(crate) async fn fetch_max_unit_index_by_qr_and_kid(
    db: &PgPool,
    qr_code: &str,
    kid_number: &str,
) -> Result<Option<i32>, sqlx::Error> {
    let row: Option<(Option<i32>,)> = sqlx::query_as(
        r#"
        SELECT MAX(unit_index)::INT
        FROM intakes
        WHERE is_removed = FALSE AND qr_code = $1 AND kid_number = $2
        "#,
    )
    .bind(qr_code)
    .bind(kid_number)
    .fetch_optional(db)
    .await?;
    Ok(row.and_then(|(max_unit,)| max_unit))
}

pub(crate) async fn ensure_pool_section_row(
    tx: &mut Transaction<'_, Postgres>,
    section: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO warehouse_slot_pools (section, slots)
        VALUES ($1, '{}'::jsonb)
        ON CONFLICT (section) DO NOTHING
        "#,
    )
    .bind(section)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub(crate) async fn lock_all_pool_slots(
    tx: &mut Transaction<'_, Postgres>,
) -> Result<Vec<(String, Value)>, sqlx::Error> {
    sqlx::query_as::<_, (String, Value)>(
        r#"
        SELECT section, slots
        FROM warehouse_slot_pools
        ORDER BY section
        FOR UPDATE
        "#,
    )
    .fetch_all(&mut **tx)
    .await
}

pub(crate) async fn update_pool_slots_for_section(
    tx: &mut Transaction<'_, Postgres>,
    section: &str,
    slots: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE warehouse_slot_pools
        SET slots = $2::jsonb,
            updated_at = NOW()
        WHERE section = $1
        "#,
    )
    .bind(section)
    .bind(slots)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub(crate) async fn fetch_section_max_rows(
    db: &PgPool,
) -> Result<Vec<(String, Option<i32>)>, sqlx::Error> {
    sqlx::query_as::<_, (String, Option<i32>)>(
        r#"
        SELECT section, MAX(slot_number)::INT
        FROM intakes
        WHERE is_removed = FALSE
        GROUP BY section
        "#,
    )
    .fetch_all(db)
    .await
}
