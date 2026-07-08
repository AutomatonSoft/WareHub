from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("telegram_service", "0003_telegramaccessbinding_approval_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="app_user_email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="app_user_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="app_user_login",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="telegramaccessbinding",
            name="app_user_username",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
