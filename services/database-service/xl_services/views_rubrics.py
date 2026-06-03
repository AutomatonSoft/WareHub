import html
import logging

import mysql.connector
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission
from xl_services.models import ImportedProduct
from xl_services.source_client import fetch_xl_language_id_by_locale, source_db_config_for_xl
from xl_services.views_common import force_xl_site, normalize_site_key

logger = logging.getLogger(__name__)


class XLRubricsTreeAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        force_xl_site(request)
        site_key = normalize_site_key(request.query_params.get("site_key"))
        language = (request.query_params.get("language") or "de").strip().lower() or "de"
        db_config = source_db_config_for_xl(site_key=site_key)
        if not db_config:
            return Response(
                {
                    "code": "xl_source_db_not_configured",
                    "detail": "Не настроены credentials source DB для XL.",
                    "site": ImportedProduct.Site.XL,
                    "site_key": site_key or "",
                    "items": [],
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        locale_to_language_id = fetch_xl_language_id_by_locale(db_config)
        language_id = locale_to_language_id.get(language) or locale_to_language_id.get(language[:2]) or locale_to_language_id.get("de") or 1
        prefix = db_config.get("table_prefix", "oc_")
        t_category = f"`{prefix}category`"
        t_category_description = f"`{prefix}category_description`"

        conn = None
        cur = None
        try:
            conn = mysql.connector.connect(
                host=db_config["host"],
                user=db_config["user"],
                password=db_config["password"],
                database=db_config["database"],
                port=db_config["port"],
            )
            cur = conn.cursor(dictionary=True)
            cur.execute("SHOW TABLES LIKE %s", (f"{prefix}category",))
            if cur.fetchone() is None:
                return Response(
                    {"detail": "В XL source DB не найдена таблица oc_category.", "site": ImportedProduct.Site.XL, "items": []},
                    status=status.HTTP_404_NOT_FOUND,
                )
            cur.execute("SHOW TABLES LIKE %s", (f"{prefix}category_description",))
            has_description = cur.fetchone() is not None
            cur.execute(f"SHOW COLUMNS FROM {t_category} LIKE %s", ("status",))
            has_status = cur.fetchone() is not None
            where_sql = "WHERE c.status = 1" if has_status else ""

            if has_description:
                cur.execute(
                    f"""
                    SELECT
                        c.category_id,
                        c.parent_id,
                        c.sort_order,
                        cd.name
                    FROM {t_category} c
                    LEFT JOIN {t_category_description} cd
                        ON cd.category_id = c.category_id
                       AND cd.language_id = %s
                    {where_sql}
                    ORDER BY c.parent_id ASC, c.sort_order ASC, c.category_id ASC
                    """,
                    (language_id,),
                )
            else:
                cur.execute(
                    f"""
                    SELECT
                        c.category_id,
                        c.parent_id,
                        c.sort_order,
                        NULL AS name
                    FROM {t_category} c
                    {where_sql}
                    ORDER BY c.parent_id ASC, c.sort_order ASC, c.category_id ASC
                    """
                )

            rows = cur.fetchall() or []
            nodes = []
            by_parent = {}
            for row in rows:
                category_id = int(row.get("category_id") or 0)
                if category_id <= 0:
                    continue
                parent_id = int(row.get("parent_id") or 0)
                node = {
                    "id": category_id,
                    "category_id": category_id,
                    "parent_id": parent_id,
                    "name": html.unescape((row.get("name") or "").strip()) or f"category-{category_id}",
                    "rubnum": str(category_id),
                    "rub_parent": str(parent_id) if parent_id else "",
                    "urlkey": "",
                    "sort_order": int(row.get("sort_order") or 0),
                }
                nodes.append(node)
                by_parent.setdefault(parent_id, []).append(node)

            for parent_nodes in by_parent.values():
                parent_nodes.sort(key=lambda x: (int(x.get("sort_order") or 0), int(x.get("id") or 0)))

            def build_tree(parent_id: int):
                items = []
                for node in by_parent.get(parent_id, []):
                    item = dict(node)
                    item["children"] = build_tree(int(node["id"]))
                    items.append(item)
                return items

            return Response(
                {
                    "site": ImportedProduct.Site.XL,
                    "site_key": site_key or "",
                    "language": language,
                    "language_id": language_id,
                    "count": len(nodes),
                    "items": nodes,
                    "tree": build_tree(0),
                },
                status=status.HTTP_200_OK,
            )
        except Exception as exc:
            logger.exception("XL_RUBRICS_TREE_FAILED code=xl_rubrics_tree_failed site_key=%s", site_key)
            return Response(
                {
                    "code": "xl_rubrics_tree_failed",
                    "detail": "Failed to load XL categories from source DB.",
                    "error": str(exc),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        finally:
            try:
                if cur is not None:
                    cur.close()
            finally:
                if conn is not None:
                    conn.close()
