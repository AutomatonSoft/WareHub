from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0030_alter_kid_kid_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="kid",
            name="store",
            field=models.BooleanField(default=False),
        ),
    ]
