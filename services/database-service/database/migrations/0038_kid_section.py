from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0037_kid_unique_non_empty_place"),
    ]

    operations = [
        migrations.AddField(
            model_name="kid",
            name="section",
            field=models.CharField(blank=True, max_length=1, null=True),
        ),
    ]
