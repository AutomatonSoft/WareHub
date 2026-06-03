from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("jv_services", "0006_importedproductcategory_main_category"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            DO $$
            BEGIN
                IF to_regclass('public.xljv_batch_jobs') IS NOT NULL
                   AND to_regclass('public.jv_batch_jobs') IS NULL THEN
                    ALTER TABLE public.xljv_batch_jobs RENAME TO jv_batch_jobs;
                END IF;
            END $$;
            """,
            reverse_sql="""
            DO $$
            BEGIN
                IF to_regclass('public.jv_batch_jobs') IS NOT NULL
                   AND to_regclass('public.xljv_batch_jobs') IS NULL THEN
                    ALTER TABLE public.jv_batch_jobs RENAME TO xljv_batch_jobs;
                END IF;
            END $$;
            """,
        ),
        migrations.RunSQL(
            sql="""
            DO $$
            BEGIN
                IF to_regclass('public.xljv_batch_job_items') IS NOT NULL
                   AND to_regclass('public.jv_batch_job_items') IS NULL THEN
                    ALTER TABLE public.xljv_batch_job_items RENAME TO jv_batch_job_items;
                END IF;
            END $$;
            """,
            reverse_sql="""
            DO $$
            BEGIN
                IF to_regclass('public.jv_batch_job_items') IS NOT NULL
                   AND to_regclass('public.xljv_batch_job_items') IS NULL THEN
                    ALTER TABLE public.jv_batch_job_items RENAME TO xljv_batch_job_items;
                END IF;
            END $$;
            """,
        ),
    ]
