import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("otto_service", "0004_add_otto_image_url")]
    operations = [migrations.CreateModel(
        name="OttoPublication",
        fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("profile", models.CharField(choices=[("jv", "JV"), ("xl", "XL")], max_length=2)),
            ("sku", models.CharField(max_length=255)),
            ("ean", models.CharField(max_length=255)),
            ("submission_id", models.UUIDField(default=uuid.uuid4)),
            ("task_id", models.CharField(blank=True, max_length=128)),
            ("state", models.CharField(default="pending", max_length=24)),
            ("online", models.BooleanField(default=None, null=True)),
            ("errors", models.JSONField(default=list)),
            ("submitted_at", models.DateTimeField()),
            ("next_check_at", models.DateTimeField(db_index=True, null=True)),
            ("checked_at", models.DateTimeField(null=True)),
        ],
        options={"constraints": [models.UniqueConstraint(fields=("profile", "sku"), name="otto_publication_profile_sku")]},
    )]
