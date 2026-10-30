import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("kaufland", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="KauflandPublication",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("controller", models.CharField(choices=[("jv", "JV"), ("xl", "XL")], max_length=2)),
                ("ean", models.CharField(max_length=64)),
                ("submission_id", models.UUIDField(default=uuid.uuid4)),
                ("online", models.BooleanField(default=False)),
                ("errors", models.JSONField(default=list)),
                ("submitted_at", models.DateTimeField()),
                ("checked_at", models.DateTimeField(null=True)),
                ("next_check_at", models.DateTimeField(db_index=True, null=True)),
            ],
            options={"constraints": [models.UniqueConstraint(fields=("controller", "ean"), name="kaufland_publication_controller_ean")]},
        ),
    ]
