use sqlx::PgPool;

#[derive(Debug, Clone, sqlx::FromRow)]
pub(crate) struct LabelLayoutSettingsRow {
    pub(crate) qr_scale: f64,
    pub(crate) qr_offset_x: f64,
    pub(crate) qr_offset_y: f64,
    pub(crate) main_scale: f64,
    pub(crate) main_offset_x: f64,
    pub(crate) main_offset_y: f64,
    pub(crate) parts_scale: f64,
    pub(crate) parts_offset_x: f64,
    pub(crate) parts_offset_y: f64,
}

pub(crate) async fn fetch_label_layout_settings(
    db: &PgPool,
) -> Result<Option<LabelLayoutSettingsRow>, sqlx::Error> {
    sqlx::query_as::<_, LabelLayoutSettingsRow>(
        r#"
        SELECT
            qr_scale,
            qr_offset_x,
            qr_offset_y,
            main_scale,
            main_offset_x,
            main_offset_y,
            parts_scale,
            parts_offset_x,
            parts_offset_y
        FROM label_layout_settings
        WHERE id = TRUE
        "#,
    )
    .fetch_optional(db)
    .await
}

pub(crate) async fn upsert_label_layout_settings(
    db: &PgPool,
    row: &LabelLayoutSettingsRow,
) -> Result<LabelLayoutSettingsRow, sqlx::Error> {
    sqlx::query_as::<_, LabelLayoutSettingsRow>(
        r#"
        INSERT INTO label_layout_settings (
            id, qr_scale, qr_offset_x, qr_offset_y,
            main_scale, main_offset_x, main_offset_y,
            parts_scale, parts_offset_x, parts_offset_y, updated_at
        )
        VALUES (
            TRUE, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        )
        ON CONFLICT (id) DO UPDATE
        SET
            qr_scale = EXCLUDED.qr_scale,
            qr_offset_x = EXCLUDED.qr_offset_x,
            qr_offset_y = EXCLUDED.qr_offset_y,
            main_scale = EXCLUDED.main_scale,
            main_offset_x = EXCLUDED.main_offset_x,
            main_offset_y = EXCLUDED.main_offset_y,
            parts_scale = EXCLUDED.parts_scale,
            parts_offset_x = EXCLUDED.parts_offset_x,
            parts_offset_y = EXCLUDED.parts_offset_y,
            updated_at = NOW()
        RETURNING
            qr_scale,
            qr_offset_x,
            qr_offset_y,
            main_scale,
            main_offset_x,
            main_offset_y,
            parts_scale,
            parts_offset_x,
            parts_offset_y
        "#,
    )
    .bind(row.qr_scale)
    .bind(row.qr_offset_x)
    .bind(row.qr_offset_y)
    .bind(row.main_scale)
    .bind(row.main_offset_x)
    .bind(row.main_offset_y)
    .bind(row.parts_scale)
    .bind(row.parts_offset_x)
    .bind(row.parts_offset_y)
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
    async fn fetch_label_layout_settings_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let result = fetch_label_layout_settings(&pool).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn upsert_label_layout_settings_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let row = LabelLayoutSettingsRow {
            qr_scale: 0.78,
            qr_offset_x: 0.0,
            qr_offset_y: 0.0,
            main_scale: 1.0,
            main_offset_x: 0.0,
            main_offset_y: 0.0,
            parts_scale: 1.0,
            parts_offset_x: 0.0,
            parts_offset_y: 0.0,
        };
        let result = upsert_label_layout_settings(&pool, &row).await;
        assert!(result.is_err());
    }
}
