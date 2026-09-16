from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="EbayOAuthCredential",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("account", models.CharField(max_length=2, unique=True)),
                ("refresh_token_encrypted", models.TextField()),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
