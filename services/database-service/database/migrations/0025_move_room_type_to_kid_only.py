from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("database", "0024_restore_kid_furniture_type"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        UPDATE database_kid AS kid
                        SET room = attrs.room
                        FROM database_productattributes AS attrs
                        WHERE attrs.kid_id = kid.id
                          AND attrs.room IS NOT NULL
                          AND btrim(attrs.room) <> ''
                          AND (
                              kid.room IS NULL
                              OR btrim(kid.room) = ''
                          );

                        UPDATE database_kid AS kid
                        SET furniture_type = attrs.furniture_type
                        FROM database_productattributes AS attrs
                        WHERE attrs.kid_id = kid.id
                          AND attrs.furniture_type IS NOT NULL
                          AND btrim(attrs.furniture_type) <> ''
                          AND (
                              kid.furniture_type IS NULL
                              OR btrim(kid.furniture_type) = ''
                          );

                        ALTER TABLE database_productattributes
                        DROP COLUMN IF EXISTS room;

                        ALTER TABLE database_productattributes
                        DROP COLUMN IF EXISTS furniture_type;
                    """,
                    reverse_sql="""
                        ALTER TABLE database_productattributes
                        ADD COLUMN IF NOT EXISTS room varchar(128) NULL;

                        ALTER TABLE database_productattributes
                        ADD COLUMN IF NOT EXISTS furniture_type varchar(128) NULL;

                        UPDATE database_productattributes AS attrs
                        SET room = kid.room,
                            furniture_type = kid.furniture_type
                        FROM database_kid AS kid
                        WHERE attrs.kid_id = kid.id;
                    """,
                ),
            ],
            state_operations=[
                migrations.RemoveField(
                    model_name="productattributes",
                    name="room",
                ),
                migrations.RemoveField(
                    model_name="productattributes",
                    name="furniture_type",
                ),
            ],
        ),
    ]
