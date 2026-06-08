use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, QueryBuilder, Transaction};
use uuid::Uuid;

use crate::{IntakeDto, ProductStockStatDto};

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct RemovedIntakePhotoRow {
    pub(crate) id: Uuid,
    pub(crate) photo_url: String,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct PhotoCleanupRetryRow {
    pub(crate) photo_url: String,
    pub(crate) attempts: i32,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct PhotoCleanupRetryQueueStatsRow {
    pub(crate) pending_count: i64,
    pub(crate) due_count: i64,
    pub(crate) max_attempts: i32,
    pub(crate) oldest_created_at: Option<DateTime<Utc>>,
    pub(crate) next_attempt_at: Option<DateTime<Utc>>,
}

pub(crate) async fn fetch_intakes_rows(
    db: &PgPool,
    limit: i64,
    offset: i64,
    section: Option<&str>,
    activity_filter: Option<bool>,
    search: Option<&str>,
) -> Result<Vec<IntakeDto>, sqlx::Error> {
    let mut qb = QueryBuilder::<Postgres>::new(
        r#"
        SELECT
            id, qr_code, warehouse_location, kid_number, photo_url, product_key,
            category_main, category_sub, is_b_ware, b_ware_comment,
            section, slot_number, box_index, box_total, unit_index,
            internal_index,
            order_id, product_title, product_sku, product_ean, product_price,
            product_size, product_color, product_sale_date, order_memo,
            created_at, is_removed, removed_at,
            (NOT is_removed) AS is_active
        FROM intakes
        "#,
    );

    let mut has_where = false;
    let mut push_where = |qb: &mut QueryBuilder<'_, Postgres>| {
        if !has_where {
            qb.push(" WHERE ");
            has_where = true;
        } else {
            qb.push(" AND ");
        }
    };

    if let Some(section) = section {
        push_where(&mut qb);
        qb.push("section = ").push_bind(section);
    }

    if let Some(is_removed) = activity_filter {
        push_where(&mut qb);
        qb.push("is_removed = ").push_bind(is_removed);
    }

    if let Some(search) = search {
        let pattern = format!("%{}%", search.to_lowercase());
        push_where(&mut qb);
        qb.push("LOWER(CONCAT_WS(' ', qr_code, kid_number, COALESCE(product_key, ''), COALESCE(product_title, ''), COALESCE(category_main, ''), COALESCE(category_sub, ''), COALESCE(internal_index, ''))) LIKE ")
            .push_bind(pattern);
    }

    qb.push(" ORDER BY created_at DESC ");
    qb.push(" LIMIT ").push_bind(limit);
    qb.push(" OFFSET ").push_bind(offset);

    qb.build_query_as::<IntakeDto>().fetch_all(db).await
}

pub(crate) async fn fetch_product_stats_rows(
    db: &PgPool,
) -> Result<Vec<ProductStockStatDto>, sqlx::Error> {
    sqlx::query_as::<_, ProductStockStatDto>(
        r#"
        SELECT
            COALESCE(product_key, qr_code) AS product_ref,
            MAX(product_title) AS product_title,
            COUNT(*) FILTER (WHERE is_removed = FALSE)::BIGINT AS active_units,
            MIN(created_at) AS first_created_at,
            MAX(created_at) AS last_created_at
        FROM intakes
        GROUP BY COALESCE(product_key, qr_code)
        ORDER BY MAX(created_at) DESC
        LIMIT 500
        "#,
    )
    .fetch_all(db)
    .await
}

pub(crate) async fn soft_delete_intake_by_id(
    tx: &mut Transaction<'_, Postgres>,
    intake_id: Uuid,
) -> Result<Option<IntakeDto>, sqlx::Error> {
    sqlx::query_as::<_, IntakeDto>(
        r#"
        UPDATE intakes
        SET is_removed = TRUE,
            removed_at = NOW()
        WHERE id = $1 AND is_removed = FALSE
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
    .bind(intake_id)
    .fetch_optional(&mut **tx)
    .await
}

pub(crate) async fn hard_delete_intake_by_id(
    tx: &mut Transaction<'_, Postgres>,
    intake_id: Uuid,
) -> Result<Option<IntakeDto>, sqlx::Error> {
    sqlx::query_as::<_, IntakeDto>(
        r#"
        DELETE FROM intakes
        WHERE id = $1
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
    .bind(intake_id)
    .fetch_optional(&mut **tx)
    .await
}

pub(crate) async fn update_intake_photo_by_id(
    tx: &mut Transaction<'_, Postgres>,
    intake_id: Uuid,
    photo_url: Option<&str>,
) -> Result<Option<IntakeDto>, sqlx::Error> {
    sqlx::query_as::<_, IntakeDto>(
        r#"
        UPDATE intakes
        SET photo_url = $2
        WHERE id = $1
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
    .bind(intake_id)
    .bind(photo_url)
    .fetch_optional(&mut **tx)
    .await
}

pub(crate) async fn count_active_rows_for_slot(
    tx: &mut Transaction<'_, Postgres>,
    section: &str,
    slot_number: i32,
) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)::BIGINT
        FROM intakes
        WHERE is_removed = FALSE
          AND section = $1
          AND slot_number = $2
        "#,
    )
    .bind(section)
    .bind(slot_number)
    .fetch_one(&mut **tx)
    .await?;
    Ok(row.0)
}

pub(crate) async fn release_pool_slot_mapping(
    tx: &mut Transaction<'_, Postgres>,
    section: &str,
    slot_number: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE warehouse_slot_pools
        SET slots = slots - $2,
            updated_at = NOW()
        WHERE section = $1
        "#,
    )
    .bind(section)
    .bind(slot_number.to_string())
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub(crate) async fn fetch_removed_intake_photos(
    db: &PgPool,
    limit: i64,
) -> Result<Vec<RemovedIntakePhotoRow>, sqlx::Error> {
    sqlx::query_as::<_, RemovedIntakePhotoRow>(
        r#"
        SELECT id, photo_url
        FROM intakes
        WHERE is_removed = TRUE
          AND photo_url IS NOT NULL
          AND LENGTH(TRIM(photo_url)) > 0
        ORDER BY removed_at ASC NULLS LAST, created_at ASC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(db)
    .await
}

#[allow(dead_code)]
pub(crate) async fn fetch_orphan_removed_intake_photos_older_than(
    db: &PgPool,
    retention_days: i64,
    limit: i64,
) -> Result<Vec<RemovedIntakePhotoRow>, sqlx::Error> {
    sqlx::query_as::<_, RemovedIntakePhotoRow>(
        r#"
        SELECT i.id, i.photo_url
        FROM intakes i
        WHERE i.is_removed = TRUE
          AND i.photo_url IS NOT NULL
          AND LENGTH(TRIM(i.photo_url)) > 0
          AND i.removed_at IS NOT NULL
          AND i.removed_at < (NOW() - ($1::BIGINT * INTERVAL '1 day'))
          AND NOT EXISTS (
              SELECT 1
              FROM intakes a
              WHERE a.is_removed = FALSE
                AND a.photo_url = i.photo_url
          )
        ORDER BY i.removed_at ASC, i.created_at ASC
        LIMIT $2
        "#,
    )
    .bind(retention_days)
    .bind(limit)
    .fetch_all(db)
    .await
}

pub(crate) async fn clear_intake_photo_urls_by_ids(
    db: &PgPool,
    intake_ids: &[Uuid],
) -> Result<i64, sqlx::Error> {
    if intake_ids.is_empty() {
        return Ok(0);
    }
    let result = sqlx::query(
        r#"
        UPDATE intakes
        SET photo_url = NULL
        WHERE id = ANY($1)
          AND photo_url IS NOT NULL
        "#,
    )
    .bind(intake_ids)
    .execute(db)
    .await?;
    Ok(result.rows_affected() as i64)
}

pub(crate) async fn enqueue_photo_cleanup_retry(
    db: &PgPool,
    photo_url: &str,
    error: &str,
    request_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO photo_cleanup_retry_queue (
            photo_url, attempts, next_attempt_at, last_error, last_request_id, created_at, updated_at
        )
        VALUES (
            $1, 1, NOW() + INTERVAL '5 seconds', $2, $3, NOW(), NOW()
        )
        ON CONFLICT (photo_url) DO UPDATE
        SET attempts = photo_cleanup_retry_queue.attempts + 1,
            next_attempt_at = NOW() + (
                CASE
                    WHEN photo_cleanup_retry_queue.attempts + 1 <= 1 THEN INTERVAL '5 seconds'
                    WHEN photo_cleanup_retry_queue.attempts + 1 = 2 THEN INTERVAL '10 seconds'
                    WHEN photo_cleanup_retry_queue.attempts + 1 = 3 THEN INTERVAL '20 seconds'
                    WHEN photo_cleanup_retry_queue.attempts + 1 = 4 THEN INTERVAL '30 seconds'
                    WHEN photo_cleanup_retry_queue.attempts + 1 = 5 THEN INTERVAL '60 seconds'
                    ELSE INTERVAL '120 seconds'
                END
            ),
            last_error = EXCLUDED.last_error,
            last_request_id = EXCLUDED.last_request_id,
            updated_at = NOW()
        "#,
    )
    .bind(photo_url)
    .bind(error)
    .bind(request_id)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn fetch_due_photo_cleanup_retries(
    db: &PgPool,
    limit: i64,
) -> Result<Vec<PhotoCleanupRetryRow>, sqlx::Error> {
    sqlx::query_as::<_, PhotoCleanupRetryRow>(
        r#"
        SELECT photo_url, attempts
        FROM photo_cleanup_retry_queue
        WHERE next_attempt_at <= NOW()
        ORDER BY next_attempt_at ASC, created_at ASC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(db)
    .await
}

pub(crate) async fn delete_photo_cleanup_retry(
    db: &PgPool,
    photo_url: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        DELETE FROM photo_cleanup_retry_queue
        WHERE photo_url = $1
        "#,
    )
    .bind(photo_url)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn reschedule_photo_cleanup_retry(
    db: &PgPool,
    photo_url: &str,
    error: &str,
    request_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE photo_cleanup_retry_queue
        SET attempts = attempts + 1,
            next_attempt_at = NOW() + (
                CASE
                    WHEN attempts + 1 <= 1 THEN INTERVAL '5 seconds'
                    WHEN attempts + 1 = 2 THEN INTERVAL '10 seconds'
                    WHEN attempts + 1 = 3 THEN INTERVAL '20 seconds'
                    WHEN attempts + 1 = 4 THEN INTERVAL '30 seconds'
                    WHEN attempts + 1 = 5 THEN INTERVAL '60 seconds'
                    ELSE INTERVAL '120 seconds'
                END
            ),
            last_error = $2,
            last_request_id = $3,
            updated_at = NOW()
        WHERE photo_url = $1
        "#,
    )
    .bind(photo_url)
    .bind(error)
    .bind(request_id)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn fetch_photo_cleanup_retry_queue_stats(
    db: &PgPool,
) -> Result<PhotoCleanupRetryQueueStatsRow, sqlx::Error> {
    sqlx::query_as::<_, PhotoCleanupRetryQueueStatsRow>(
        r#"
        SELECT
            COUNT(*)::BIGINT AS pending_count,
            COUNT(*) FILTER (WHERE next_attempt_at <= NOW())::BIGINT AS due_count,
            COALESCE(MAX(attempts), 0)::INT AS max_attempts,
            MIN(created_at) AS oldest_created_at,
            MIN(next_attempt_at) AS next_attempt_at
        FROM photo_cleanup_retry_queue
        "#,
    )
    .fetch_one(db)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;

    fn unreachable_pool() -> PgPool {
        PgPoolOptions::new()
            .max_connections(1)
            .connect_lazy("postgres://sofortbot:sofortbot@127.0.0.1:1/sofortbot")
            .expect("must create lazy pool")
    }

    #[tokio::test]
    async fn fetch_intakes_rows_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let result = fetch_intakes_rows(&pool, 10, 0, None, Some(false), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn fetch_product_stats_rows_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let result = fetch_product_stats_rows(&pool).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn fetch_removed_intake_photos_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let result = fetch_removed_intake_photos(&pool, 10).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn clear_intake_photo_urls_by_ids_returns_zero_for_empty_input() {
        let pool = unreachable_pool();
        let result = clear_intake_photo_urls_by_ids(&pool, &[])
            .await
            .expect("empty input must short-circuit");
        assert_eq!(result, 0);
    }

    #[tokio::test]
    async fn fetch_orphan_removed_intake_photos_older_than_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let result = fetch_orphan_removed_intake_photos_older_than(&pool, 7, 10).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn enqueue_photo_cleanup_retry_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let result = enqueue_photo_cleanup_retry(&pool, "https://cdn/a.jpg", "boom", "rid").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn fetch_due_photo_cleanup_retries_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let result = fetch_due_photo_cleanup_retries(&pool, 10).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn delete_photo_cleanup_retry_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let result = delete_photo_cleanup_retry(&pool, "https://cdn/a.jpg").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn reschedule_photo_cleanup_retry_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let result = reschedule_photo_cleanup_retry(&pool, "https://cdn/a.jpg", "boom", "rid").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn fetch_photo_cleanup_retry_queue_stats_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let result = fetch_photo_cleanup_retry_queue_stats(&pool).await;
        assert!(result.is_err());
    }
}
