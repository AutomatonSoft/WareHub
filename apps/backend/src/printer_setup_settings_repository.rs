use sqlx::PgPool;

#[derive(Debug, Clone, sqlx::FromRow)]
pub(crate) struct PrinterSetupSettingsRow {
    pub(crate) print_width_px: i32,
    pub(crate) print_height_px: i32,
    pub(crate) print_density: i32,
    pub(crate) print_label_type: i32,
    pub(crate) print_inter_label_delay_ms: i32,
    pub(crate) print_preview_only: bool,
}

pub(crate) async fn fetch_printer_setup_settings(
    db: &PgPool,
) -> Result<Option<PrinterSetupSettingsRow>, sqlx::Error> {
    sqlx::query_as::<_, PrinterSetupSettingsRow>(
        r#"
        SELECT
            print_width_px,
            print_height_px,
            print_density,
            print_label_type,
            print_inter_label_delay_ms,
            print_preview_only
        FROM printer_setup_settings
        WHERE id = TRUE
        "#,
    )
    .fetch_optional(db)
    .await
}

pub(crate) async fn upsert_printer_setup_settings(
    db: &PgPool,
    row: &PrinterSetupSettingsRow,
) -> Result<PrinterSetupSettingsRow, sqlx::Error> {
    sqlx::query_as::<_, PrinterSetupSettingsRow>(
        r#"
        INSERT INTO printer_setup_settings (
            id,
            print_width_px,
            print_height_px,
            print_density,
            print_label_type,
            print_inter_label_delay_ms,
            print_preview_only,
            updated_at
        )
        VALUES (TRUE, $1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (id) DO UPDATE
        SET
            print_width_px = EXCLUDED.print_width_px,
            print_height_px = EXCLUDED.print_height_px,
            print_density = EXCLUDED.print_density,
            print_label_type = EXCLUDED.print_label_type,
            print_inter_label_delay_ms = EXCLUDED.print_inter_label_delay_ms,
            print_preview_only = EXCLUDED.print_preview_only,
            updated_at = NOW()
        RETURNING
            print_width_px,
            print_height_px,
            print_density,
            print_label_type,
            print_inter_label_delay_ms,
            print_preview_only
        "#,
    )
    .bind(row.print_width_px)
    .bind(row.print_height_px)
    .bind(row.print_density)
    .bind(row.print_label_type)
    .bind(row.print_inter_label_delay_ms)
    .bind(row.print_preview_only)
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
    async fn fetch_printer_setup_settings_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let result = fetch_printer_setup_settings(&pool).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn upsert_printer_setup_settings_returns_error_when_db_unreachable() {
        let pool = unreachable_pool();
        let row = PrinterSetupSettingsRow {
            print_width_px: 384,
            print_height_px: 640,
            print_density: 5,
            print_label_type: 1,
            print_inter_label_delay_ms: 120,
            print_preview_only: false,
        };
        let result = upsert_printer_setup_settings(&pool, &row).await;
        assert!(result.is_err());
    }
}
