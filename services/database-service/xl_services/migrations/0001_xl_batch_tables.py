from django.db import migrations


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS xl_batch_jobs (
                id BIGSERIAL PRIMARY KEY,
                ean VARCHAR(64) NOT NULL,
                site_family VARCHAR(8) NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                initiated_by VARCHAR(150) NOT NULL DEFAULT 'system',
                idempotency_key VARCHAR(255) NOT NULL DEFAULT '',
                request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS xl_batch_jobs_ean_idx ON xl_batch_jobs (ean);
            CREATE INDEX IF NOT EXISTS xl_batch_jobs_site_family_idx ON xl_batch_jobs (site_family);
            CREATE INDEX IF NOT EXISTS xl_batch_jobs_status_idx ON xl_batch_jobs (status);
            CREATE INDEX IF NOT EXISTS xl_batch_jobs_idempotency_key_idx ON xl_batch_jobs (idempotency_key);
            """,
            reverse_sql="""
            DROP TABLE IF EXISTS xl_batch_job_items;
            DROP TABLE IF EXISTS xl_batch_jobs;
            """,
        ),
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS xl_batch_job_items (
                id BIGSERIAL PRIMARY KEY,
                job_id BIGINT NOT NULL REFERENCES xl_batch_jobs(id) ON DELETE CASCADE,
                site VARCHAR(8) NOT NULL,
                site_key VARCHAR(64) NOT NULL DEFAULT '',
                domain VARCHAR(255) NOT NULL DEFAULT '',
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                source_product_id BIGINT NULL,
                effective_ean VARCHAR(64) NOT NULL DEFAULT '',
                currency_code VARCHAR(8) NOT NULL DEFAULT '',
                old_price NUMERIC(15,4) NULL,
                new_price NUMERIC(15,4) NULL,
                error_code VARCHAR(128) NOT NULL DEFAULT '',
                error_text TEXT NOT NULL DEFAULT '',
                details JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS xl_batch_job_items_job_id_idx ON xl_batch_job_items (job_id);
            CREATE INDEX IF NOT EXISTS xl_batch_job_items_site_idx ON xl_batch_job_items (site);
            CREATE INDEX IF NOT EXISTS xl_batch_job_items_site_key_idx ON xl_batch_job_items (site_key);
            CREATE INDEX IF NOT EXISTS xl_batch_job_items_status_idx ON xl_batch_job_items (status);
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
