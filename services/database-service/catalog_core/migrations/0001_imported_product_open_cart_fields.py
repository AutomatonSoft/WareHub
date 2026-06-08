from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("jv_services", "0008_state_drop_imported_models"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE imported_products ADD COLUMN IF NOT EXISTS shipping boolean NOT NULL DEFAULT true;
            ALTER TABLE imported_products ADD COLUMN IF NOT EXISTS subtract boolean NOT NULL DEFAULT true;
            ALTER TABLE imported_products ADD COLUMN IF NOT EXISTS minimum integer NULL;
            ALTER TABLE imported_products ADD COLUMN IF NOT EXISTS points integer NULL;
            ALTER TABLE imported_products ADD COLUMN IF NOT EXISTS sort_order integer NULL;
            ALTER TABLE imported_products ADD COLUMN IF NOT EXISTS seo_url varchar(255) NOT NULL DEFAULT '';
            """,
            reverse_sql="""
            ALTER TABLE imported_products DROP COLUMN IF EXISTS seo_url;
            ALTER TABLE imported_products DROP COLUMN IF EXISTS sort_order;
            ALTER TABLE imported_products DROP COLUMN IF EXISTS points;
            ALTER TABLE imported_products DROP COLUMN IF EXISTS minimum;
            ALTER TABLE imported_products DROP COLUMN IF EXISTS subtract;
            ALTER TABLE imported_products DROP COLUMN IF EXISTS shipping;
            """,
        ),
    ]
