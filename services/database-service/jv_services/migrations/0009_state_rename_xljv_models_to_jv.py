from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("jv_services", "0008_state_drop_imported_models"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RenameModel(
                    old_name="XLJVBatchJob",
                    new_name="JVBatchJob",
                ),
                migrations.AlterModelTable(
                    name="jvbatchjob",
                    table="jv_batch_jobs",
                ),
                migrations.RenameModel(
                    old_name="XLJVBatchJobItem",
                    new_name="JVBatchJobItem",
                ),
                migrations.AlterModelTable(
                    name="jvbatchjobitem",
                    table="jv_batch_job_items",
                ),
                migrations.AlterField(
                    model_name="jvbatchjobitem",
                    name="job",
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="jv_services.jvbatchjob",
                    ),
                ),
            ],
        ),
    ]
