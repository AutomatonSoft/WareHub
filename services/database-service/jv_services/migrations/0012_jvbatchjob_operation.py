from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("jv_services", "0011_alter_jvbatchjob_status"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            # Keep the schema change idempotent (matches the house style in
            # 0007) so re-running against an already-patched DB is a no-op.
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    DO $$
                    BEGIN
                        IF to_regclass('public.jv_batch_jobs') IS NOT NULL
                           AND NOT EXISTS (
                               SELECT 1 FROM information_schema.columns
                               WHERE table_name = 'jv_batch_jobs'
                                 AND column_name = 'operation'
                           ) THEN
                            ALTER TABLE public.jv_batch_jobs
                                ADD COLUMN operation varchar(16) NOT NULL DEFAULT 'update';
                            CREATE INDEX IF NOT EXISTS jv_batch_jobs_operation_idx
                                ON public.jv_batch_jobs (operation);
                        END IF;
                    END $$;
                    """,
                    reverse_sql="""
                    DO $$
                    BEGIN
                        IF to_regclass('public.jv_batch_jobs') IS NOT NULL
                           AND EXISTS (
                               SELECT 1 FROM information_schema.columns
                               WHERE table_name = 'jv_batch_jobs'
                                 AND column_name = 'operation'
                           ) THEN
                            DROP INDEX IF EXISTS jv_batch_jobs_operation_idx;
                            ALTER TABLE public.jv_batch_jobs DROP COLUMN operation;
                        END IF;
                    END $$;
                    """,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="jvbatchjob",
                    name="operation",
                    field=models.CharField(
                        choices=[("update", "Update"), ("create", "Create")],
                        db_index=True,
                        default="update",
                        max_length=16,
                    ),
                ),
            ],
        ),
    ]
