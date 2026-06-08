from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("jv_services", "0009_state_rename_xljv_models_to_jv"),
    ]

    operations = [
        migrations.AlterField(
            model_name="jvbatchjob",
            name="site_family",
            field=models.CharField(
                choices=[("JV", "JV")],
                db_index=True,
                max_length=8,
            ),
        ),
    ]
