from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("database", "0053_kid_archived")]

    operations = [
        migrations.RemoveConstraint(model_name="kid", name="uniq_kid_non_empty_place"),
        migrations.AddConstraint(
            model_name="kid",
            constraint=models.UniqueConstraint(
                fields=["place"],
                condition=models.Q(archived=False, place__isnull=False)
                & ~models.Q(place="")
                & ~models.Q(place__startswith="-"),
                name="uniq_kid_non_empty_place",
            ),
        ),
    ]
