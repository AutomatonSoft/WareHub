from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0038_kid_section"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="kid",
            name="listing_status",
        ),
    ]
