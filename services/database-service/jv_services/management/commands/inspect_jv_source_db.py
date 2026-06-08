from django.core.management.base import BaseCommand, CommandError
import re

from jv_services.source_client import _mysql_connect, source_db_config_for_site


class Command(BaseCommand):
    help = "Inspect configured JV source DB tables using env-based credentials."

    def add_arguments(self, parser):
        parser.add_argument("--site", default="JV")
        parser.add_argument("--site-key", default="JV_DE")
        parser.add_argument("--limit", type=int, default=3)
        parser.add_argument(
            "--table",
            action="append",
            dest="tables",
            default=[],
            help="Table to inspect. Can be passed multiple times.",
        )

    def handle(self, *args, **options):
        site = str(options["site"] or "JV").strip().upper()
        site_key = str(options["site_key"] or "JV_DE").strip().upper()
        limit = max(0, min(int(options["limit"]), 20))
        db_config = source_db_config_for_site(site, site_key=site_key)
        if not db_config:
            raise CommandError(f"JV source DB is not configured for site={site}, site_key={site_key}.")

        tables = options["tables"] or [
            "shopartikel",
            "shopartikellang",
            "shoprubrikartikel",
            "shopmedia",
            "shopartikellieferanteninfo",
        ]
        invalid_tables = [table for table in tables if not re.match(r"^[A-Za-z0-9_]+$", str(table or ""))]
        if invalid_tables:
            raise CommandError(f"Invalid table name(s): {', '.join(map(str, invalid_tables))}")

        conn = _mysql_connect(db_config)
        try:
            cur = conn.cursor(dictionary=True)
            for table in tables:
                self.stdout.write(f"\n=== {table} ===")
                cur.execute(f"DESCRIBE `{table}`")
                for row in cur.fetchall():
                    self.stdout.write(str(row))

                cur.execute(f"SELECT COUNT(*) AS count FROM `{table}`")
                self.stdout.write(f"Rows: {cur.fetchone()['count']}")

                if limit:
                    cur.execute(f"SELECT * FROM `{table}` LIMIT %s", (limit,))
                    for row in cur.fetchall():
                        self.stdout.write(str(row))
        finally:
            conn.close()
