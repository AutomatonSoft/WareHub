from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.utils import ProgrammingError
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch
from datetime import timedelta
import requests

from catalog_core.models import ImportedProduct
from jv_services.source_push import push_product_to_source
from .kid_green_import_service import (
    FetchResult,
    KidGreenImportResult,
    KidImportStats,
    OrderImportStats,
    load_kid_payloads_from_bytes,
    upsert_kids,
    upsert_orders_for_kids,
)
from .kid_number_utils import primary_kid_number
from .inventory_audit_service import record_inventory_change, retained_inventory_history_photo_urls
from .models import Client, EANPool, Ean, EanStatus, InventoryChangeLog, Kid, OrderItem, Orders, ProductAttributes
from .views import KidListCreateAPIView


RU_LIVING_ROOM = "\u0413\u043e\u0441\u0442\u0438\u043d\u0430\u044f"
RU_KITCHEN = "\u041a\u0443\u0445\u043d\u044f"
RU_SOFA = "\u0414\u0438\u0432\u0430\u043d"
RU_TABLE = "\u0421\u0442\u043e\u043b"


class DatabaseApiTests(APITestCase):
    def set_session_role(self, role):
        session = self.client.session
        session["role"] = role
        session.save()

    def setUp(self):
        self.set_session_role("admin")
        self.kid = Kid.objects.create(kid_number="13234455")
        self.order = Orders.objects.create(
            kid=self.kid,
            order_id="ORDER-001",
            sku="1234567890123",
            title="Test order",
            memo="Test memo",
            status="no_paid",
            order_date="2026-04-06T10:00:00Z",
        )

    def test_ean_pool_claim_for_job_is_idempotent_and_can_be_marked_used(self):
        first = EANPool.objects.create(ean="4012345678901")
        EANPool.objects.create(ean="4012345678902")
        job_id = "b1d878f1-7a89-4c7b-a5fb-1b3a0e310ac1"

        first_claim = self.client.post("/api/v1/ean-pool/claim-for-job/", {"job_id": job_id}, format="json")
        repeated_claim = self.client.post("/api/v1/ean-pool/claim-for-job/", {"job_id": job_id}, format="json")

        self.assertEqual(first_claim.status_code, status.HTTP_200_OK)
        self.assertEqual(repeated_claim.status_code, status.HTTP_200_OK)
        self.assertEqual(first_claim.data["ean"], first.ean)
        self.assertEqual(repeated_claim.data["ean"], first.ean)

        marked = self.client.post("/api/v1/ean-pool/mark-job-used/", {"job_id": job_id}, format="json")
        self.assertEqual(marked.status_code, status.HTTP_200_OK)
        first.refresh_from_db()
        self.assertEqual(first.status, "used")

    def test_primary_kid_number_uses_last_list_item(self):
        self.kid.kid_number = ["OLD-001", "OLD-002", "NEW-003"]
        self.kid.save(update_fields=["kid_number"])

        self.kid.refresh_from_db()

        self.assertEqual(primary_kid_number(self.kid.kid_number), "NEW-003")

    def test_inventory_change_history_removes_records_older_than_90_days(self):
        expired_entry = InventoryChangeLog.objects.create(
            kid=self.kid,
            kid_number="EXPIRED-001",
            action="product_updated",
        )
        InventoryChangeLog.objects.filter(pk=expired_entry.pk).update(
            created_at=timezone.now() - timedelta(days=91)
        )
        recent_entry = InventoryChangeLog.objects.create(
            kid=self.kid,
            kid_number="RECENT-001",
            action="product_updated",
        )

        response = self.client.get("/api/v1/inventory/change-history/?limit=20")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in response.data["results"]], [recent_entry.id])
        self.assertFalse(InventoryChangeLog.objects.filter(pk=expired_entry.pk).exists())

    def test_inventory_change_history_filters_by_kid_place_actor_and_date_range(self):
        matching_entry = InventoryChangeLog.objects.create(
            kid=self.kid,
            kid_number="KID-SEARCH-001",
            place="155A",
            actor_login="ravil",
            actor_name="Ravil Raykhanov",
            action="product_updated",
        )
        other_entry = InventoryChangeLog.objects.create(
            kid=self.kid,
            kid_number="KID-OTHER-002",
            place="39",
            actor_login="other",
            actor_name="Other User",
            action="product_updated",
        )
        InventoryChangeLog.objects.filter(pk=other_entry.pk).update(
            created_at=timezone.now() - timedelta(days=8)
        )

        response = self.client.get(
            "/api/v1/inventory/change-history/",
            {
                "q": "155A",
                "actor": "ravil",
                "date_from": timezone.localdate().isoformat(),
                "date_to": timezone.localdate().isoformat(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in response.data["results"]], [matching_entry.id])
        self.assertEqual(response.data["actors"], [{"value": "ravil", "label": "Ravil Raykhanov"}])

    def test_inventory_change_history_paginates_ten_entries_per_page(self):
        InventoryChangeLog.objects.bulk_create(
            [
                InventoryChangeLog(kid=self.kid, kid_number=f"KID-{index}", action="product_updated")
                for index in range(12)
            ]
        )

        response = self.client.get("/api/v1/inventory/change-history/", {"limit": 10, "page": 2})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total"], 12)
        self.assertEqual(response.data["page"], 2)
        self.assertEqual(response.data["page_size"], 10)
        self.assertEqual(len(response.data["results"]), 2)

    def test_inventory_history_retains_removed_photo_urls_for_90_days(self):
        retained_url = "https://example.test/removed-photo.png"
        InventoryChangeLog.objects.create(
            kid=self.kid,
            action="product_updated",
            changes=[{"field": "photo", "before": [retained_url], "after": []}],
        )

        self.assertEqual(
            retained_inventory_history_photo_urls([retained_url, "https://example.test/unused-photo.png"]),
            {retained_url},
        )

    def test_bulk_update_records_price_change_in_inventory_history(self):
        ProductAttributes.objects.create(kid=self.kid, price="100.00")

        response = self.client.patch(
            "/api/v1/kids/bulk-update/",
            {"updates": [{"kid_id": self.kid.id, "price": "125.50"}]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        history_entry = InventoryChangeLog.objects.filter(kid=self.kid).latest("id")
        self.assertEqual(
            history_entry.changes,
            [{"field": "attributes.price", "before": "100.00", "after": "125.50"}],
        )

    def test_inventory_history_records_each_product_field_change_separately(self):
        record_inventory_change(
            kid=self.kid,
            actor={"login": "ravil", "name": "Ravil Raykhanov"},
            action="product_updated",
            changes=[
                {"field": "attributes.price", "before": "100.00", "after": "125.50"},
                {"field": "attributes.color", "before": "Black", "after": "White"},
            ],
        )

        rows = list(InventoryChangeLog.objects.filter(kid=self.kid).order_by("id"))
        self.assertEqual(len(rows), 2)
        self.assertEqual(
            [row.changes for row in rows],
            [
                [{"field": "attributes.price", "before": "100.00", "after": "125.50"}],
                [{"field": "attributes.color", "before": "Black", "after": "White"}],
            ],
        )

    def test_kid_detail_view_returns_related_inventory_tables_for_selected_kid(self):
        self.kid.account = "JV"
        self.kid.place = "155A"
        self.kid.section = "C"
        self.kid.room = "Wohnzimmer"
        self.kid.furniture_type = "Sofa"
        self.kid.commentary = "Test commentary"
        self.kid.photo = ["https://cdn.example.com/photo-main.jpg"]
        self.kid.save(
            update_fields=["account", "place", "section", "room", "furniture_type", "commentary", "photo"]
        )
        Ean.objects.create(
            kid=self.kid,
            main_ean="4062292498370",
            jv="1111111111111",
            xl="2222222222222",
            otto_jv="B_WARE",
        )
        EanStatus.objects.create(
            ean=self.kid,
            jv=True,
            xl=False,
            otto_jv=True,
            ebay_jv=False,
        )
        ProductAttributes.objects.create(
            kid=self.kid,
            quantity=2,
            company="omide",
            color="Grey",
            size="3-Sitzer",
            material="Metall",
            price=Decimal("761.00"),
            currency="EUR",
        )
        Client.objects.create(
            kid=self.kid,
            billing_first_name="Maria",
            billing_last_name="Haase",
            billing_street="Hauptstr. 26",
            billing_postal_code="37434",
            billing_city="Obernfeld",
            billing_country_iso="DE",
            billing_phone="015111650993",
            billing_fax="055279999",
            billing_email="maria@example.com",
            shipping_first_name="Stefanie",
            shipping_last_name="Haase",
            shipping_street="Hauptstr. 77",
            shipping_postal_code="37434",
            shipping_city="Rollshausen",
            shipping_country_iso="DE",
        )
        self.order.full_amount = "761.00"
        self.order.invoice_number = "INV-001"
        self.order.invoice_amount = Decimal("761.00")
        self.order.already_paid = Decimal("500.00")
        self.order.payment_date = timezone.now()
        self.order.payment_method = "Transfer"
        self.order.shipping_method = "DHL"
        self.order.status = "no_paid"
        self.order.save(update_fields=[
            "full_amount",
            "invoice_number",
            "invoice_amount",
            "already_paid",
            "payment_date",
            "payment_method",
            "shipping_method",
            "status",
        ])
        OrderItem.objects.create(
            order=self.order,
            afterbuy_item_id="ORDER-001",
            title="Основная позиция",
            quantity=1,
            item_price=Decimal("761.00"),
            item_end_date=timezone.now(),
            currency="EUR",
        )
        OrderItem.objects.create(
            order=self.order,
            afterbuy_item_id="ORDER-001-EXTRA",
            title="Дополнительная позиция",
            quantity=1,
            item_price=Decimal("0.00"),
            item_end_date=timezone.now(),
            currency="EUR",
        )
        record_inventory_change(
            kid=self.kid,
            actor={"login": "ravil", "name": "Ravil Raykhanov"},
            action="product_updated",
            changes=[{"field": "attributes.price", "before": "750.00", "after": "761.00"}],
        )

        response = self.client.get(f"/api/v1/kids/{self.kid.id}/detail-view/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kid"]["id"], self.kid.id)
        self.assertEqual(response.data["kid"]["place"], "155A")
        self.assertEqual(response.data["ean"]["main_ean"], "4062292498370")
        self.assertEqual(response.data["ean_status"]["jv"], True)
        self.assertEqual(response.data["product_attributes"]["price"], "761.00")
        self.assertEqual(response.data["product_attributes"]["company"], "omide")
        self.assertEqual(response.data["client"]["billing_first_name"], "Maria")
        self.assertEqual(response.data["client"]["billing_phone"], "015111650993")
        self.assertEqual(response.data["client"]["billing_fax"], "055279999")
        self.assertEqual(response.data["client"]["billing_email"], "maria@example.com")
        self.assertEqual(response.data["client"]["shipping_city"], "Rollshausen")
        self.assertEqual(len(response.data["orders"]), 1)
        self.assertEqual(response.data["orders"][0]["order_id"], "ORDER-001")
        self.assertEqual(response.data["orders"][0]["invoice_number"], "INV-001")
        self.assertEqual(response.data["orders"][0]["invoice_amount"], "761.00")
        self.assertIsNotNone(response.data["orders"][0]["payment_date"])
        self.assertEqual(response.data["orders"][0]["payment_method"], "Transfer")
        self.assertEqual(response.data["orders"][0]["shipping_method"], "DHL")
        self.assertEqual(response.data["orders"][0]["already_paid"], "500.00")
        self.assertEqual(response.data["orders"][0]["outstanding_amount"], "261.00")
        self.assertFalse(response.data["orders"][0]["is_fully_paid"])
        self.assertEqual(len(response.data["orders"][0]["items"]), 2)
        self.assertEqual(response.data["orders"][0]["items"][0]["afterbuy_item_id"], "ORDER-001")
        self.assertEqual(response.data["orders"][0]["items"][0]["title"], "Основная позиция")
        self.assertEqual(response.data["orders"][0]["items"][0]["quantity"], 1)
        self.assertEqual(response.data["orders"][0]["items"][0]["item_price"], "761.00")
        self.assertIsNotNone(response.data["orders"][0]["items"][0]["item_end_date"])
        self.assertEqual(response.data["orders"][0]["items"][0]["currency"], "EUR")
        self.assertTrue(response.data["orders"][0]["items"][0]["is_main_item"])
        self.assertFalse(response.data["orders"][0]["items"][1]["is_main_item"])
        self.assertEqual(len(response.data["inventory_change_log"]), 1)
        self.assertEqual(
            response.data["inventory_change_log"][0]["changes"],
            [{"field": "attributes.price", "before": "750.00", "after": "761.00"}],
        )

    def test_inventory_dashboard_summary_reports_inventory_readiness(self):
        self.kid.place = "1A"
        self.kid.photo = ["https://example.test/product.png"]
        self.kid.in_transit = True
        self.kid.b_ware = True
        self.kid.save(update_fields=["place", "photo", "in_transit", "b_ware"])
        Ean.objects.create(kid=self.kid, main_ean="4260174428871")
        ProductAttributes.objects.create(kid=self.kid, price=Decimal("199.99"))
        EanStatus.objects.create(
            ean=self.kid,
            jv=True,
            otto_jv=True,
            ebay_xl=True,
            kaufland_jv=True,
            hood_xl=True,
        )

        missing_photo = Kid.objects.create(kid_number="MISSING-PHOTO", place="2A", in_transit=True)
        Ean.objects.create(kid=missing_photo, main_ean="4260174428872")
        ProductAttributes.objects.create(kid=missing_photo, price=Decimal("49.99"))

        Kid.objects.create(
            kid_number="MISSING-METADATA",
            photo=["https://example.test/other.png"],
        )

        response = self.client.get("/api/v1/inventory/dashboard-summary/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                "total_products": 3,
                "placed_products": 2,
                "unplaced_products": 1,
                "without_photos": 1,
                "without_ean": 1,
                "without_price": 1,
                "ready_for_listing": 1,
                "readiness_percent": 33,
                "in_transit_products": 2,
                "b_ware_products": 1,
                "marketplace_statuses": {
                    "jv": {"true_count": 1, "false_count": 0},
                    "xl": {"true_count": 0, "false_count": 1},
                    "otto_jv": {"true_count": 1, "false_count": 0},
                    "otto_xl": {"true_count": 0, "false_count": 1},
                    "ebay_jv": {"true_count": 0, "false_count": 1},
                    "ebay_xl": {"true_count": 1, "false_count": 0},
                    "kaufland_jv": {"true_count": 1, "false_count": 0},
                    "kaufland_xl": {"true_count": 0, "false_count": 1},
                    "hood_jv": {"true_count": 0, "false_count": 1},
                    "hood_xl": {"true_count": 1, "false_count": 0},
                },
            },
        )

    def test_create_kid(self):
        payload = {"kid_number": "900900"}
        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Kid.objects.filter(kid_number__contains=["900900"]).count(), 1)
        kid = Kid.objects.get(kid_number__contains=["900900"])
        ean_row = Ean.objects.get(kid=kid)
        self.assertIsNone(ean_row.main_ean)
        self.assertIsNone(ean_row.jv)
        self.assertIsNone(ean_row.xl)
        self.assertIsNone(ean_row.otto_jv)
        self.assertIsNone(ean_row.otto_xl)
        self.assertIsNone(ean_row.kaufland_jv)
        self.assertIsNone(ean_row.kaufland_xl)
        self.assertIsNone(ean_row.hood_jv)
        self.assertIsNone(ean_row.hood_xl)
        self.assertIsNone(ean_row.ebay_jv)
        self.assertIsNone(ean_row.ebay_xl)
        self.assertFalse(kid.store)
        self.assertIn("sync", response.data)
        self.assertIsNone(response.data["sync"]["error"])
        self.assertIsNone(response.data["sync"]["error_detail"])
        self.assertEqual(kid.place, "1")

    @patch("database.views.search_items_auktionsliste", side_effect=RuntimeError("Missing Afterbuy login credentials in .env for JV, XL or CH."))
    def test_create_kid_reports_missing_afterbuy_credentials(self, mocked_search):
        response = self.client.post("/api/v1/kids/", {"kid_number": "900903"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["sync"]["error"], "missing_afterbuy_credentials")
        self.assertIn("Missing Afterbuy login credentials", response.data["sync"]["error_detail"])
        mocked_search.assert_called_once()

    @patch("database.views.search_items_auktionsliste", side_effect=RuntimeError("XL login failed. Check AFTERBUY_XL_LOGIN / AFTERBUY_XL_PASS and any second-factor requirements."))
    def test_create_kid_reports_afterbuy_login_failure(self, mocked_search):
        response = self.client.post("/api/v1/kids/", {"kid_number": "900904"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["sync"]["error"], "afterbuy_login_failed")
        self.assertIn("login failed", response.data["sync"]["error_detail"].lower())
        mocked_search.assert_called_once()

    @patch("database.views.search_items_auktionsliste", side_effect=requests.RequestException("afterbuy stage timeout"))
    def test_create_kid_reports_afterbuy_network_failure(self, mocked_search):
        response = self.client.post("/api/v1/kids/", {"kid_number": "900905"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["sync"]["error"], "afterbuy_network_failed")
        self.assertIn("timeout", response.data["sync"]["error_detail"].lower())
        mocked_search.assert_called_once()

    @patch("database.views.Orders.objects.create", side_effect=RuntimeError("order write failed"))
    @patch(
        "database.views.search_items_auktionsliste",
        return_value=[
            {
                "order_id": "ORDER-FAIL-1",
                "title": "Order sync failure fixture",
                "zahlungssumme": "10,00",
                "rechnungssumme": "10,00",
            }
        ],
    )
    def test_create_kid_reports_afterbuy_order_persist_failure(self, mocked_search, mocked_create_order):
        response = self.client.post("/api/v1/kids/", {"kid_number": "900907"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["sync"]["error"], "afterbuy_order_sync_failed")
        self.assertIn("order write failed", response.data["sync"]["error_detail"])
        self.assertTrue(Kid.objects.filter(kid_number__contains=["900907"]).exists())
        mocked_search.assert_called_once()
        mocked_create_order.assert_called_once()

    @patch.object(KidListCreateAPIView, "_upsert_product_attributes", side_effect=RuntimeError("attributes write failed"))
    def test_create_kid_reports_product_attributes_persist_failure(self, mocked_upsert_product_attributes):
        response = self.client.post(
            "/api/v1/kids/",
            {
                "kid_number": "900908",
                "quantity": 5,
                "price": "4561",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["enrichment"]["ok"])
        self.assertEqual(
            response.data["enrichment"]["errors"][0]["code"],
            "product_attributes_persist_failed",
        )
        self.assertIn("attributes write failed", response.data["enrichment"]["errors"][0]["detail"])
        self.assertTrue(Kid.objects.filter(kid_number__contains=["900908"]).exists())
        mocked_upsert_product_attributes.assert_called_once()

    @patch.object(KidListCreateAPIView, "_upsert_main_ean", side_effect=RuntimeError("main ean write failed"))
    def test_create_kid_reports_main_ean_persist_failure(self, mocked_upsert_main_ean):
        response = self.client.post(
            "/api/v1/kids/",
            {
                "kid_number": "900909",
                "place": "9999",
                "main_ean": "4260174428871",
                "quantity": 5,
                "price": "4561",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["enrichment"]["ok"])
        self.assertEqual(
            response.data["enrichment"]["errors"][0]["code"],
            "main_ean_persist_failed",
        )
        self.assertIn("main ean write failed", response.data["enrichment"]["errors"][0]["detail"])
        self.assertTrue(Kid.objects.filter(kid_number__contains=["900909"]).exists())
        mocked_upsert_main_ean.assert_called_once()

    @patch.object(KidListCreateAPIView, "_ensure_database_ean_defaults")
    def test_create_kid_initializes_database_ean_defaults(self, mocked_sync):
        payload = {"kid_number": "900902"}

        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mocked_sync.assert_called_once()
        synced_kid = mocked_sync.call_args.args[0]
        self.assertEqual(primary_kid_number(synced_kid.kid_number), "900902")

    def test_create_kid_with_type_and_photo_list(self):
        payload = {
            "kid_number": "900901",
            "room": "Wohnzimmer",
            "type": "Sofa",
            "quantity": 3,
            "company": "JV Möbel",
            "color": "Ivory",
            "size": "140x200",
            "material": "Velvet",
            "price": "349.99",
            "currency": "EUR",
            "photo": [
                "https://cdn.example.com/photo-1.jpg",
                "https://cdn.example.com/photo-2.jpg",
            ],
        }

        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        kid = Kid.objects.get(kid_number__contains=["900901"])
        self.assertEqual(kid.room, "Wohnzimmer")
        self.assertEqual(kid.furniture_type, "Sofa")
        self.assertEqual(
            kid.photo,
            [
                "https://cdn.example.com/photo-1.jpg",
                "https://cdn.example.com/photo-2.jpg",
            ],
        )
        attrs = ProductAttributes.objects.get(kid=kid)
        self.assertEqual(attrs.quantity, 3)
        self.assertEqual(attrs.company, "JV Möbel")
        self.assertEqual(attrs.color, "Ivory")
        self.assertEqual(attrs.size, "140x200")
        self.assertEqual(attrs.material, "Velvet")
        self.assertEqual(str(attrs.price), "349.99")
        self.assertEqual(attrs.currency, "EUR")

    def test_create_kid_accepts_main_ean(self):
        payload = {
            "kid_number": "900906",
            "place": "12",
            "main_ean": "4062292028939",
            "quantity": 3,
            "price": "349.99",
        }

        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        kid = Kid.objects.get(kid_number__contains=["900906"])
        ean_row = Ean.objects.get(kid=kid)
        attrs = ProductAttributes.objects.get(kid=kid)
        self.assertEqual(ean_row.main_ean, "4062292028939")
        self.assertEqual(attrs.quantity, 3)
        self.assertEqual(str(attrs.price), "349.99")

    @override_settings(
        ALLOWED_HOSTS=["localhost", "127.0.0.1", "services"],
        ORCHESTRATOR_SERVICE_AUTH_TOKEN="warehub-local-orchestrator",
        ORCHESTRATOR_SERVICE_ALLOWED_HOSTS=["localhost", "127.0.0.1", "services"],
    )
    def test_create_kid_accepts_main_ean_for_service_token_requests(self):
        payload = {
            "kid_number": "900910",
            "place": "9999",
            "main_ean": "4260174428871",
            "quantity": 5,
            "price": "4564",
        }

        self.client.cookies.clear()
        response = self.client.post(
            "/api/v1/kids/",
            payload,
            format="json",
            HTTP_HOST="services:8000",
            HTTP_X_WAREHUB_SERVICE_TOKEN="warehub-local-orchestrator",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        kid = Kid.objects.get(kid_number__contains=["900910"])
        ean_row = Ean.objects.get(kid=kid)
        attrs = ProductAttributes.objects.get(kid=kid)
        self.assertEqual(ean_row.main_ean, "4260174428871")
        self.assertEqual(attrs.quantity, 5)
        self.assertEqual(str(attrs.price), "4564.00")

    def test_create_kid_is_idempotent_by_place_for_same_kid(self):
        self.kid.place = "A1"
        self.kid.save(update_fields=["place"])
        payload = {"kid_number": self.kid.kid_number, "place": "A1"}
        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Kid.objects.filter(kid_number__contains=[primary_kid_number(self.kid.kid_number)]).count(),
            1,
        )
        self.kid.refresh_from_db()
        self.assertEqual(self.kid.place, "A1")

    def test_create_kid_with_existing_kid_number_and_no_place_returns_place_suggestions(self):
        self.kid.place = "2"
        self.kid.save(update_fields=["place"])
        Kid.objects.create(kid_number=["OTHER-001A"], place="2A")
        Kid.objects.create(kid_number=["OTHER-001B"], place="2B")
        for occupied_base in ("3", "4", "5", "6"):
            Kid.objects.create(kid_number=[f"BASE-{occupied_base}"], place=occupied_base)

        response = self.client.post(
            "/api/v1/kids/",
            {"kid_number": primary_kid_number(self.kid.kid_number)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "kid_already_exists_place_required")
        self.assertEqual(response.data["details"]["current_place"], "2")
        self.assertEqual(response.data["details"]["same_base_subplace"], "2C")
        self.assertEqual(response.data["details"]["next_free_base_place"], "7")
        self.kid.refresh_from_db()
        self.assertEqual(self.kid.place, "2")

    def test_create_kid_same_kid_number_with_new_place_creates_new_kid(self):
        self.kid.place = "2"
        self.kid.save(update_fields=["place"])

        payload = {
            "kid_number": self.kid.kid_number,
            "place": "2A",
            "room": "Wohnzimmer",
            "type": "Sofa",
        }

        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.kid.refresh_from_db()
        self.assertEqual(self.kid.place, "2")
        self.assertEqual(
            Kid.objects.filter(kid_number__contains=[primary_kid_number(self.kid.kid_number)]).count(),
            2,
        )
        created = Kid.objects.get(id=response.data["id"])
        self.assertEqual(created.place, "2A")
        self.assertEqual(created.room, "Wohnzimmer")
        self.assertEqual(created.furniture_type, "Sofa")

    def test_create_kid_is_idempotent_and_updates_inventory_fields_by_place(self):
        self.kid.place = "A-01"
        self.kid.save(update_fields=["place"])
        payload = {
            "kid_number": self.kid.kid_number,
            "place": "A-01",
            "room": "Wohnzimmer",
            "type": "Sofa",
            "quantity": 2,
            "company": "Otto Home",
            "color": "Graphite",
            "size": "90x210",
            "material": "Wood",
            "price": "199.50",
            "currency": "USD",
            "commentary": "Updated note",
            "b_ware": True,
            "store": True,
            "in_transit": True,
            "photo": ["https://cdn.example.com/photo-main.jpg"],
        }

        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.kid.refresh_from_db()
        self.assertEqual(self.kid.place, "A-01")
        self.assertEqual(self.kid.room, "Wohnzimmer")
        self.assertEqual(self.kid.furniture_type, "Sofa")
        self.assertEqual(self.kid.commentary, "Updated note")
        self.assertTrue(self.kid.b_ware)
        self.assertTrue(self.kid.store)
        self.assertTrue(self.kid.in_transit)
        self.assertEqual(self.kid.photo, ["https://cdn.example.com/photo-main.jpg"])
        attrs = ProductAttributes.objects.get(kid=self.kid)
        self.assertEqual(attrs.quantity, 2)
        self.assertEqual(attrs.company, "Otto Home")
        self.assertEqual(attrs.color, "Graphite")
        self.assertEqual(attrs.size, "90x210")
        self.assertEqual(attrs.material, "Wood")
        self.assertEqual(str(attrs.price), "199.50")
        self.assertEqual(attrs.currency, "EUR")

    def test_create_kid_rejects_place_used_by_another_kid(self):
        Kid.objects.create(kid_number=["OTHER-001"], place="2")
        Kid.objects.create(kid_number=["OTHER-001A"], place="2A")
        Kid.objects.create(kid_number=["OTHER-001B"], place="2B")
        for occupied_base in ("3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17"):
            Kid.objects.create(kid_number=[f"BASE-{occupied_base}"], place=occupied_base)

        response = self.client.post(
            "/api/v1/kids/",
            {"kid_number": "900911", "place": "2"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("place", response.data)
        self.assertEqual(response.data["code"], "place_occupied")
        self.assertEqual(response.data["details"]["requested_place"], "2")
        self.assertEqual(response.data["details"]["suggested_place"], "2C")
        self.assertEqual(response.data["details"]["same_base_subplace"], "2C")
        self.assertEqual(response.data["details"]["next_free_base_place"], "18")
        self.assertIn("2C", response.data["place"][0])
        self.assertIn("18", response.data["place"][0])
        self.assertEqual(Kid.objects.filter(kid_number__contains=["900911"]).count(), 0)

    def test_update_kid_rejects_place_used_by_another_kid(self):
        other_kid = Kid.objects.create(kid_number=["OTHER-002"], place="2")

        response = self.client.patch(
            f"/api/v1/kids/{self.kid.id}/",
            {"place": "2"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("place", response.data)
        self.assertEqual(response.data["details"]["requested_place"], "2")
        self.assertEqual(response.data["details"]["suggested_place"], "2A")
        self.assertEqual(response.data["details"]["same_base_subplace"], "2A")
        self.kid.refresh_from_db()
        self.assertNotEqual(self.kid.place, "2")

    def test_create_kid_allows_subplace_when_base_place_exists(self):
        Kid.objects.create(kid_number=["OTHER-003"], place="2")

        response = self.client.post(
            "/api/v1/kids/",
            {"kid_number": "900912", "place": "2A"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Kid.objects.filter(kid_number__contains=["900912"], place="2A").exists())

    def test_create_kid_rejects_multi_letter_subplace(self):
        response = self.client.post(
            "/api/v1/kids/",
            {"kid_number": "900913", "place": "2AA"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("place", response.data)

    def test_create_kid_suggests_next_free_base_place_after_z(self):
        Kid.objects.create(kid_number=["POOL-BASE"], place="2")
        for suffix in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            Kid.objects.create(kid_number=[f"POOL-{suffix}"], place=f"2{suffix}")
        for occupied_base in ("3", "4", "5", "6"):
            Kid.objects.create(kid_number=[f"POOL-{occupied_base}"], place=occupied_base)

        response = self.client.post(
            "/api/v1/kids/",
            {"kid_number": "900914", "place": "2Z"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "place_occupied")
        self.assertEqual(response.data["details"]["requested_place"], "2Z")
        self.assertEqual(response.data["details"]["suggested_place"], "7")
        self.assertIsNone(response.data["details"]["same_base_subplace"])
        self.assertEqual(response.data["details"]["next_free_base_place"], "7")
        self.assertIn("7", response.data["place"][0])

    def test_kid_composite_update_updates_kid_ean_product_attributes_and_order(self):
        ean_row = Ean.objects.create(kid=self.kid, jv="1111111111111")
        attrs_row = ProductAttributes.objects.create(kid=self.kid, quantity=1, company="Old Co")

        payload = {
            "kid": {
                "place": "B-12",
                "room": "Bedroom",
                "commentary": "Updated from composite endpoint",
                "section": "c",
            },
            "ean": {
                "jv": "4062292028939",
                "hood_jv": "4062292028939",
            },
            "product_attributes": {
                "quantity": 7,
                "company": "New Co",
                "price": "499.90",
                "currency": "USD",
            },
            "orders": [
                {
                    "id": self.order.id,
                    "order_id": "ORDER-002",
                    "title": "Updated order",
                    "status": "paid",
                }
            ],
        }

        response = self.client.patch(f"/api/v1/kids/{self.kid.id}/composite-update/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.kid.refresh_from_db()
        ean_row.refresh_from_db()
        attrs_row.refresh_from_db()
        self.order.refresh_from_db()

        self.assertEqual(self.kid.place, "B-12")
        self.assertEqual(self.kid.room, "Bedroom")
        self.assertEqual(self.kid.commentary, "Updated from composite endpoint")
        self.assertEqual(self.kid.section, "C")
        self.assertEqual(ean_row.jv, "4062292028939")
        self.assertEqual(ean_row.hood_jv, "4062292028939")
        self.assertEqual(attrs_row.quantity, 7)
        self.assertEqual(attrs_row.company, "New Co")
        self.assertEqual(str(attrs_row.price), "499.90")
        self.assertEqual(attrs_row.currency, "USD")
        self.assertEqual(self.order.order_id, "ORDER-002")
        self.assertEqual(self.order.title, "Updated order")
        self.assertEqual(self.order.status, "paid")

    def test_kid_composite_update_rejects_order_from_another_kid(self):
        other_kid = Kid.objects.create(kid_number="99887766")
        other_order = Orders.objects.create(
            kid=other_kid,
            order_id="ORDER-OTHER",
            title="Other order",
            status="no_paid",
        )

        response = self.client.patch(
            f"/api/v1/kids/{self.kid.id}/composite-update/",
            {"orders": [{"id": other_order.id, "title": "Should fail"}]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_kid_green_import_requires_file_or_body(self):
        response = self.client.post("/api/v1/kids/import-kid-green/", {}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "kid_green_file_required")

    @patch("database.views.import_kid_green_json_bytes")
    def test_kid_green_import_accepts_uploaded_file(self, mocked_import):
        mocked_import.return_value = KidGreenImportResult(
            total_payloads=2,
            unique_kids=1,
            kid_stats=KidImportStats(created=1, place_appended=1, skipped=0, total_payloads=2),
            order_stats=OrderImportStats(created=3, updated=0, collapsed_positions=1, skipped_without_order_id=0, failed_kids_count=1),
            failed_kids=["KID-001"],
        )
        uploaded = SimpleUploadedFile(
            "kid_green.json",
            b'[{"kid":"KID-001","place":"A-1"}]',
            content_type="application/json",
        )

        response = self.client.post(
            "/api/v1/kids/import-kid-green/",
            {"file": uploaded, "workers": "7"},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["total_payloads"], 2)
        self.assertEqual(response.data["unique_kids"], 1)
        self.assertEqual(response.data["failed_kids"], ["KID-001"])
        mocked_import.assert_called_once()

    @patch("database.marketplace_deactivate_service.fetch_source_product_snapshot_by_ean")
    @patch("database.marketplace_deactivate_service.push_product_to_source")
    def test_marketplace_deactivate_by_ean_updates_jv_target(self, mocked_push, mocked_fetch_snapshot):
        ImportedProduct.objects.create(
            site="JV",
            site_key="JV_DE",
            source_product_id=101,
            ean="4012345678901",
            status=True,
        )
        mocked_fetch_snapshot.return_value = {
            "product": {
                "product_id": 101,
                "ean": "4012345678901",
                "sku": "SKU-101",
                "model": "MODEL-101",
                "price": "12.3400",
                "quantity": 5,
                "status": 1,
                "manufacturer_id": 7,
                "stock_status_id": 8,
                "tax_class_id": 9,
                "image": "catalog/demo.jpg",
                "date_available": "2026-06-25",
                "date_modified": "2026-06-25 12:00:00",
            },
            "descriptions": [],
            "categories": [],
            "stores": [],
            "images": [],
            "specials": [],
            "jv_fields": {},
        }

        response = self.client.post(
            "/api/v1/marketplace/deactivate-by-kid/",
            {"ean": "4012345678901", "site_keys": ["JV_DE"], "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["summary"]["success"], 1)
        self.assertEqual(response.data["results"][0]["channel"], "JV")
        self.assertTrue(response.data["results"][0]["details"]["inactive"])
        mocked_fetch_snapshot.assert_called_once()
        mocked_push.assert_called_once()

    def test_kid_green_import_creates_new_kid_for_same_kid_number_with_different_place(self):
        payloads = load_kid_payloads_from_bytes(
            b"""
            [
              {"kid":"KID-001","place":"A-1"},
              {"kid":"KID-001","place":"B-2"}
            ]
            """
        )

        kid_map, kid_stats = upsert_kids(payloads)

        self.assertEqual(kid_stats.created, 2)
        self.assertEqual(kid_stats.skipped, 0)
        self.assertEqual(kid_stats.place_appended, 0)
        self.assertEqual(len(kid_map["KID-001"]), 2)
        self.assertEqual(Kid.objects.filter(kid_number__contains=["KID-001"]).count(), 2)
        self.assertTrue(Kid.objects.filter(kid_number__contains=["KID-001"], place="A-1").exists())
        self.assertTrue(Kid.objects.filter(kid_number__contains=["KID-001"], place="B-2").exists())

    def test_kid_green_import_skips_same_kid_number_with_same_place(self):
        Kid.objects.create(kid_number=["KID-001"], place="A-1")
        payloads = load_kid_payloads_from_bytes(
            b"""
            [
              {"kid":"KID-001","place":"A-1"}
            ]
            """
        )

        kid_map, kid_stats = upsert_kids(payloads)

        self.assertEqual(kid_stats.created, 0)
        self.assertEqual(kid_stats.skipped, 1)
        self.assertEqual(Kid.objects.filter(kid_number__contains=["KID-001"]).count(), 1)
        self.assertEqual(len(kid_map["KID-001"]), 1)

    def test_kid_green_import_skips_other_kid_with_same_place(self):
        Kid.objects.create(kid_number=["KID-001"], place="A-1")
        payloads = load_kid_payloads_from_bytes(
            b"""
            [
              {"kid":"KID-002","place":"A-1"}
            ]
            """
        )

        kid_map, kid_stats = upsert_kids(payloads)

        self.assertEqual(kid_stats.created, 0)
        self.assertEqual(kid_stats.skipped, 1)
        self.assertEqual(Kid.objects.filter(place="A-1").count(), 1)
        self.assertEqual(kid_map, {})
        self.assertEqual(kid_map["KID-001"][0].place, "A-1")

    def test_kid_green_import_sets_ean_status_true_for_items_with_eans(self):
        payloads = load_kid_payloads_from_bytes(
            b"""
            [
              {
                "kid":"KID-555",
                "place":"A-1",
                "Ean.jv":"4062292028939",
                "Ean.otto_jv":"5062292028939",
                "Ean.ebay_xl":"6062292028939"
              }
            ]
            """
        )

        kid_map, kid_stats = upsert_kids(payloads)

        self.assertEqual(kid_stats.created, 1)
        kid = kid_map["KID-555"][0]
        status_row = EanStatus.objects.get(ean=kid)
        self.assertTrue(status_row.jv)
        self.assertTrue(status_row.otto_jv)
        self.assertTrue(status_row.ebay_xl)
        self.assertFalse(status_row.xl)
        self.assertFalse(status_row.otto_xl)
        self.assertFalse(status_row.hood_jv)

    @patch("database.marketplace_deactivate_service.fetch_source_product_snapshot_by_ean")
    @patch("database.marketplace_deactivate_service.push_product_to_source")
    def test_marketplace_deactivate_by_kid_number_fans_out_jv_and_updates_status(self, mocked_push, mocked_fetch_snapshot):
        kid = Kid.objects.create(kid_number=["KID-777"])
        Ean.objects.create(
            kid=kid,
            jv="4062292028939",
        )
        EanStatus.objects.create(
            ean=kid,
            jv=True,
        )
        for site_key, product_id in (
            ("JV_DE", 101),
            ("JV_CO_UK", 102),
            ("JV_CH", 103),
            ("JV_AT", 104),
        ):
            ImportedProduct.objects.create(
                site="JV",
                site_key=site_key,
                source_product_id=product_id,
                ean="4062292028939",
                status=True,
            )
        mocked_fetch_snapshot.side_effect = [
            {
                "product": {
                    "product_id": 101,
                    "ean": "4062292028939",
                    "sku": "SKU-101",
                    "model": "MODEL-101",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {},
            },
            {
                "product": {
                    "product_id": 102,
                    "ean": "4062292028939",
                    "sku": "SKU-102",
                    "model": "MODEL-102",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {},
            },
            {
                "product": {
                    "product_id": 103,
                    "ean": "4062292028939",
                    "sku": "SKU-103",
                    "model": "MODEL-103",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {},
            },
            {
                "product": {
                    "product_id": 104,
                    "ean": "4062292028939",
                    "sku": "SKU-104",
                    "model": "MODEL-104",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {},
            },
        ]

        response = self.client.post(
            "/api/v1/marketplace/deactivate-by-kid/",
            {"kid_number": "KID-777", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kid_number"], "KID-777")
        self.assertEqual(response.data["summary"]["total"], 4)
        self.assertEqual(response.data["summary"]["success"], 4)
        self.assertEqual(mocked_fetch_snapshot.call_count, 4)
        self.assertEqual(mocked_push.call_count, 4)
        status_row = EanStatus.objects.get(ean=kid)
        self.assertFalse(status_row.jv)
        for site_key in ("JV_DE", "JV_CO_UK", "JV_CH", "JV_AT"):
            product = ImportedProduct.objects.get(site="JV", site_key=site_key, ean="4062292028939")
            self.assertFalse(product.status)

    def test_marketplace_deactivate_by_kid_number_requires_payload_for_hood(self):
        kid = Kid.objects.create(kid_number=["KID-HOOD"])
        Ean.objects.create(
            kid=kid,
            hood_jv="4062292028939",
        )
        EanStatus.objects.create(
            ean=kid,
            hood_jv=True,
        )

        response = self.client.post(
            "/api/v1/marketplace/deactivate-by-kid/",
            {"kid_number": "KID-HOOD", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_207_MULTI_STATUS)
        self.assertEqual(response.data["status"], "failed")
        self.assertEqual(response.data["results"][0]["channel"], "HOOD")
        self.assertEqual(
            response.data["results"][0]["details"]["code"],
            "marketplace_deactivate_payload_required",
        )
        status_row = EanStatus.objects.get(ean=kid)
        self.assertTrue(status_row.hood_jv)

    @patch("database.marketplace_deactivate_service._apply_hood_delete_by_item_number")
    @patch("database.marketplace_deactivate_service._store_hood_snapshot_before_delete")
    def test_marketplace_hood_deactivate_by_kid_uses_ean_as_item_number(self, mocked_snapshot, mocked_delete):
        kid = Kid.objects.create(kid_number=["KID-HOOD-ONLY"])
        Ean.objects.create(
            kid=kid,
            hood_jv="4062292028939",
        )
        EanStatus.objects.create(
            ean=kid,
            hood_jv=True,
        )

        mocked_delete.return_value = {
            "ok": True,
            "site_key": "HOOD_JV",
            "channel": "HOOD",
            "status_code": status.HTTP_200_OK,
            "details": {
                "ean": "4062292028939",
                "account": "jv",
                "item_number": "4062292028939",
            },
        }
        mocked_snapshot.return_value = {
            "ok": True,
            "site_key": "HOOD_JV",
            "channel": "HOOD",
            "status_code": status.HTTP_200_OK,
            "details": {"snapshot_saved": True},
        }

        response = self.client.post(
            "/api/v1/marketplace/hood/deactivate-by-kid/",
            {"kid_number": "KID-HOOD-ONLY", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mode"], "hood_only")
        self.assertEqual(response.data["results"][0]["details"]["item_number"], "4062292028939")
        mocked_delete.assert_called_once_with(
            ean="4062292028939",
            site_key="HOOD_JV",
            account="jv",
            item_number="4062292028939",
        )
        mocked_snapshot.assert_called_once_with(
            ean="4062292028939",
            site_key="HOOD_JV",
            account="jv",
        )
        status_row = EanStatus.objects.get(ean=kid)
        self.assertFalse(status_row.hood_jv)

    @patch("database.marketplace_deactivate_service._apply_hood_delete_by_item_number")
    @patch("database.marketplace_deactivate_service._store_hood_snapshot_before_delete")
    def test_marketplace_hood_deactivate_by_kid_updates_active_hood_targets(self, mocked_snapshot, mocked_delete):
        kid = Kid.objects.create(kid_number=["KID-HOOD-BOTH"])
        Ean.objects.create(
            kid=kid,
            hood_jv="4062292028939",
            hood_xl="5062292028939",
        )
        EanStatus.objects.create(
            ean=kid,
            hood_jv=True,
            hood_xl=True,
        )

        def _fake_apply(*, ean, site_key, account, item_number):
            return {
                "ok": True,
                "site_key": site_key,
                "channel": "HOOD",
                "status_code": status.HTTP_200_OK,
                "details": {
                    "ean": ean,
                    "account": account,
                    "item_number": item_number,
                },
            }

        mocked_delete.side_effect = _fake_apply
        mocked_snapshot.side_effect = lambda *, ean, site_key, account: {
            "ok": True,
            "site_key": site_key,
            "channel": "HOOD",
            "status_code": status.HTTP_200_OK,
            "details": {"ean": ean, "account": account, "snapshot_saved": True},
        }

        response = self.client.post(
            "/api/v1/marketplace/hood/deactivate-by-kid/",
            {"kid_number": "KID-HOOD-BOTH", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mode"], "hood_only")
        self.assertEqual(response.data["summary"]["total"], 2)
        self.assertEqual(response.data["summary"]["success"], 2)
        self.assertEqual(mocked_delete.call_count, 2)
        self.assertEqual(mocked_snapshot.call_count, 2)
        first_call = mocked_delete.call_args_list[0].kwargs
        second_call = mocked_delete.call_args_list[1].kwargs
        self.assertEqual(first_call["item_number"], first_call["ean"])
        self.assertEqual(second_call["item_number"], second_call["ean"])
        status_row = EanStatus.objects.get(ean=kid)
        self.assertFalse(status_row.hood_jv)
        self.assertFalse(status_row.hood_xl)

    @patch("database.marketplace_deactivate_service._apply_hood_restore_from_snapshot")
    def test_marketplace_hood_activate_by_kid_restores_inactive_target(self, mocked_restore):
        kid = Kid.objects.create(kid_number=["KID-HOOD-RESTORE"])
        Ean.objects.create(kid=kid, hood_jv="4062292028939")
        EanStatus.objects.create(ean=kid, hood_jv=False)
        mocked_restore.return_value = {
            "ok": True,
            "site_key": "HOOD_JV",
            "channel": "HOOD",
            "status_code": status.HTTP_201_CREATED,
            "details": {"restored_from_snapshot": True},
        }

        response = self.client.post(
            "/api/v1/marketplace/hood/deactivate-by-kid/",
            {"kid_number": "KID-HOOD-RESTORE", "inactive": False, "place": "12"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertTrue(response.data["results"][0]["details"]["restored_from_snapshot"])
        mocked_restore.assert_called_once_with(
            ean="4062292028939",
            site_key="HOOD_JV",
            account="jv",
        )
        status_row = EanStatus.objects.get(ean=kid)
        self.assertTrue(status_row.hood_jv)
        kid.refresh_from_db()
        self.assertEqual(kid.place, "12")

    @patch("database.marketplace_deactivate_service.set_external_push_status")
    @patch("database.marketplace_deactivate_service.requests.post")
    @patch("database.marketplace_deactivate_service.build_create_urls", return_value=["https://hood.example/items/4062292028939"])
    @patch(
        "database.marketplace_deactivate_service.get_hood_product_snapshot_payload",
        return_value={
            "items": [
                {
                    "itemID": "remote-item-1",
                    "itemNumber": "4062292028939",
                    "title": "Saved Hood title",
                    "description": "Saved Hood description",
                    "price": "99.99",
                    "quantity": 3,
                    "categoryID": "2412",
                    "condition": "new",
                    "itemMode": "shopProduct",
                    "images": ["https://cdn.example/image.jpg"],
                    "productProperties": [{"name": "Material", "value": "Wood"}],
                }
            ]
        },
    )
    def test_hood_restore_posts_saved_snapshot_fields(
        self,
        mocked_snapshot,
        mocked_urls,
        mocked_post,
        mocked_push_status,
    ):
        from .marketplace_deactivate_service import _apply_hood_restore_from_snapshot

        mocked_post.return_value.status_code = status.HTTP_200_OK
        mocked_post.return_value.json.return_value = {"success": True}

        result = _apply_hood_restore_from_snapshot(
            ean="4062292028939",
            site_key="HOOD_JV",
            account="jv",
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["status_code"], status.HTTP_201_CREATED)
        self.assertEqual(
            mocked_post.call_args.kwargs["json"],
            {
                "description": "Saved Hood description",
                "title": "Saved Hood title",
                "price": "99.99",
                "quantity": 3,
                "categoryID": "2412",
                "condition": "new",
                "itemMode": "shopProduct",
                "itemNumber": "4062292028939",
                "images": ["https://cdn.example/image.jpg"],
                "productProperties": [{"name": "Material", "value": "Wood"}],
                "ean": "4062292028939",
                "account": "jv",
            },
        )
        mocked_push_status.assert_called_once_with(account="jv", ean="4062292028939", pushed=True)

    @patch("database.marketplace_deactivate_service._apply_xl_deactivate")
    def test_marketplace_xl_deactivate_by_kid_uses_only_xlmoebel_de_and_updates_status(self, mocked_apply_xl):
        kid = Kid.objects.create(kid_number=["KID-XL-DEACTIVATE"], place="4")
        Ean.objects.create(kid=kid, xl="4062292028939")
        EanStatus.objects.create(ean=kid, xl=True)

        mocked_apply_xl.return_value = {
            "ok": True,
            "site_key": "XLMOEBEL_DE",
            "channel": "XL",
            "status_code": status.HTTP_200_OK,
            "details": {
                "ean": "4062292028939",
                "site_key": "XLMOEBEL_DE",
                "inactive": True,
                "status": False,
            },
        }

        response = self.client.post(
            "/api/v1/marketplace/xl/deactivate-by-kid/",
            {"kid_number": "KID-XL-DEACTIVATE", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mode"], "xl_de_only")
        self.assertEqual(response.data["summary"]["total"], 1)
        mocked_apply_xl.assert_called_once_with(
            ean="4062292028939",
            site_key="XLMOEBEL_DE",
            inactive=True,
            actor="admin",
        )
        status_row = EanStatus.objects.get(ean=kid)
        self.assertFalse(status_row.xl)
        kid.refresh_from_db()
        self.assertEqual(kid.place, "-4")

    @patch("database.marketplace_deactivate_service._apply_xl_deactivate")
    def test_marketplace_xl_activate_by_kid_updates_place_from_request(self, mocked_apply_xl):
        kid = Kid.objects.create(kid_number=["KID-XL-ACTIVATE"], place="-4")
        Ean.objects.create(kid=kid, xl="4062292028939")
        EanStatus.objects.create(ean=kid, xl=False)

        mocked_apply_xl.return_value = {
            "ok": True,
            "site_key": "XLMOEBEL_DE",
            "channel": "XL",
            "status_code": status.HTTP_200_OK,
            "details": {
                "ean": "4062292028939",
                "site_key": "XLMOEBEL_DE",
                "inactive": False,
                "status": True,
            },
        }

        response = self.client.post(
            "/api/v1/marketplace/xl/deactivate-by-kid/",
            {"kid_number": "KID-XL-ACTIVATE", "inactive": False, "place": "18"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mode"], "xl_de_only")
        status_row = EanStatus.objects.get(ean=kid)
        self.assertTrue(status_row.xl)
        kid.refresh_from_db()
        self.assertEqual(kid.place, "18")

    @patch("database.marketplace_deactivate_service._apply_kaufland_active_state")
    def test_marketplace_kaufland_deactivate_by_kid_calls_jv_and_xl(self, mocked_apply):
        kid = Kid.objects.create(kid_number=["KID-KAUFLAND-DEACTIVATE"], place="4")
        Ean.objects.create(
            kid=kid,
            kaufland_jv="4062292028939",
            kaufland_xl="4062292028946",
        )
        EanStatus.objects.create(ean=kid, kaufland_jv=True, kaufland_xl=True)

        mocked_apply.side_effect = lambda **kwargs: {
            "ok": True,
            "site_key": kwargs["site_key"],
            "channel": "KAUFLAND",
            "status_code": status.HTTP_200_OK,
            "details": {
                "ean": kwargs["ean"],
                "controller": kwargs["controller"],
                "inactive": kwargs["inactive"],
            },
        }

        response = self.client.post(
            "/api/v1/marketplace/kaufland/toggle-by-kid/",
            {"kid_number": "KID-KAUFLAND-DEACTIVATE", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mode"], "kaufland_jv_xl")
        self.assertEqual(response.data["summary"], {"total": 2, "success": 2, "failed": 0})
        self.assertEqual(mocked_apply.call_count, 2)
        self.assertEqual(
            {call.kwargs["controller"] for call in mocked_apply.call_args_list},
            {"jv", "xl"},
        )
        status_row = EanStatus.objects.get(ean=kid)
        self.assertFalse(status_row.kaufland_jv)
        self.assertFalse(status_row.kaufland_xl)
        kid.refresh_from_db()
        self.assertEqual(kid.place, "-4")

    @patch("database.marketplace_deactivate_service._apply_kaufland_active_state")
    def test_marketplace_kaufland_activate_updates_only_successful_site(self, mocked_apply):
        kid = Kid.objects.create(kid_number=["KID-KAUFLAND-ACTIVATE"], place="-4")
        Ean.objects.create(
            kid=kid,
            kaufland_jv="4062292028939",
            kaufland_xl="4062292028946",
        )
        EanStatus.objects.create(ean=kid, kaufland_jv=False, kaufland_xl=False)

        mocked_apply.side_effect = [
            {
                "ok": True,
                "site_key": "KAUFLAND_JV",
                "channel": "KAUFLAND",
                "status_code": status.HTTP_200_OK,
                "details": {},
            },
            {
                "ok": False,
                "site_key": "KAUFLAND_XL",
                "channel": "KAUFLAND",
                "status_code": status.HTTP_404_NOT_FOUND,
                "details": {"code": "kaufland_toggle_failed"},
            },
        ]

        response = self.client.post(
            "/api/v1/marketplace/kaufland/toggle-by-kid/",
            {"kid_number": "KID-KAUFLAND-ACTIVATE", "inactive": False, "place": "18"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_207_MULTI_STATUS)
        self.assertEqual(response.data["status"], "partial")
        status_row = EanStatus.objects.get(ean=kid)
        self.assertTrue(status_row.kaufland_jv)
        self.assertFalse(status_row.kaufland_xl)
        kid.refresh_from_db()
        self.assertEqual(kid.place, "18")

    @patch("database.marketplace_deactivate_service._apply_kaufland_active_state")
    def test_marketplace_kaufland_toggle_is_noop_when_status_is_already_requested(self, mocked_apply):
        kid = Kid.objects.create(kid_number=["KID-KAUFLAND-NOOP"], place="-4")
        Ean.objects.create(kid=kid, kaufland_jv="4062292028939")
        EanStatus.objects.create(ean=kid, kaufland_jv=False)

        response = self.client.post(
            "/api/v1/marketplace/kaufland/toggle-by-kid/",
            {"kid_number": "KID-KAUFLAND-NOOP", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["results"][0]["details"]["code"], "marketplace_kaufland_toggle_noop")
        mocked_apply.assert_not_called()
        kid.refresh_from_db()
        self.assertEqual(kid.place, "-4")

    def test_marketplace_deactivate_by_kid_updates_unsupported_channels_locally(self):
        kid = Kid.objects.create(kid_number=["KID-LOCAL-ONLY"], place="4")
        Ean.objects.create(
            kid=kid,
            hood_jv="4062292028939",
            otto_jv="5062292028939",
            ebay_jv="6062292028939",
            kaufland_jv="7062292028939",
        )
        EanStatus.objects.create(
            ean=kid,
            hood_jv=True,
            otto_jv=True,
            ebay_jv=True,
            kaufland_jv=True,
        )

        response = self.client.post(
            "/api/v1/marketplace/deactivate-by-kid/",
            {"kid_number": "KID-LOCAL-ONLY", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["summary"]["failed"], 0)
        site_keys = {row["site_key"]: row for row in response.data["results"]}
        self.assertNotIn("HOOD_JV", site_keys)
        self.assertEqual(site_keys["OTTO_JV"]["details"]["code"], "marketplace_deactivate_local_status_only")
        self.assertEqual(site_keys["EBAY_JV"]["details"]["code"], "marketplace_deactivate_local_status_only")
        self.assertEqual(site_keys["KAUFLAND_JV"]["details"]["code"], "marketplace_deactivate_local_status_only")

        status_row = EanStatus.objects.get(ean=kid)
        self.assertTrue(status_row.hood_jv)
        self.assertFalse(status_row.otto_jv)
        self.assertFalse(status_row.ebay_jv)
        self.assertFalse(status_row.kaufland_jv)
        kid.refresh_from_db()
        self.assertEqual(kid.place, "-4")

    def test_marketplace_deactivate_by_kid_without_mapping_is_noop_success(self):
        kid = Kid.objects.create(kid_number=["KID-NO-MAPPING"], place="4")

        response = self.client.post(
            "/api/v1/marketplace/deactivate-by-kid/",
            {"kid_number": "KID-NO-MAPPING", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["summary"]["success"], 1)
        self.assertEqual(response.data["summary"]["failed"], 0)
        self.assertEqual(response.data["results"][0]["site_key"], "MARKETPLACE")
        self.assertEqual(response.data["results"][0]["details"]["code"], "marketplace_deactivate_no_mapping_noop")
        kid.refresh_from_db()
        self.assertEqual(kid.place, "4")

    @patch("database.marketplace_deactivate_service._apply_jv_deactivate")
    def test_marketplace_deactivate_by_kid_without_status_uses_present_jv_ean(self, mocked_apply_jv):
        kid = Kid.objects.create(kid_number=["KID-JV-NO-STATUS"], place="4")
        Ean.objects.create(
            kid=kid,
            main_ean="4062292001215",
            jv="JVM4062292001215",
        )

        def _fake_apply(*, ean, site_key, inactive, actor):
            return {
                "ok": True,
                "site_key": site_key,
                "channel": "JV",
                "status_code": status.HTTP_200_OK,
                "details": {
                    "ean": ean,
                    "inactive": inactive,
                    "actor": actor,
                },
            }

        mocked_apply_jv.side_effect = _fake_apply

        response = self.client.post(
            "/api/v1/marketplace/deactivate-by-kid/",
            {"kid_number": "KID-JV-NO-STATUS", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["summary"]["success"], 4)
        self.assertEqual(mocked_apply_jv.call_count, 4)
        site_keys = {row["site_key"] for row in response.data["results"]}
        self.assertEqual(site_keys, {"JV_DE", "JV_AT", "JV_CH", "JV_CO_UK"})
        status_row = EanStatus.objects.get(ean=kid)
        self.assertFalse(status_row.jv)
        kid.refresh_from_db()
        self.assertEqual(kid.place, "-4")

    @patch("database.marketplace_deactivate_service._apply_jv_deactivate")
    def test_marketplace_deactivate_by_kid_with_empty_place_does_not_fail(self, mocked_apply_jv):
        kid = Kid.objects.create(kid_number=["KID-JV-NO-PLACE"], place=None)
        Ean.objects.create(
            kid=kid,
            main_ean="4062292001215",
            jv="JVM4062292001215",
        )

        mocked_apply_jv.side_effect = lambda **kwargs: {
            "ok": True,
            "site_key": kwargs["site_key"],
            "channel": "JV",
            "status_code": status.HTTP_200_OK,
            "details": {"ean": kwargs["ean"]},
        }

        response = self.client.post(
            "/api/v1/marketplace/deactivate-by-kid/",
            {"kid_number": "KID-JV-NO-PLACE", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(mocked_apply_jv.call_count, 4)
        kid.refresh_from_db()
        self.assertIsNone(kid.place)

    def test_marketplace_local_statuses_by_kid_keeps_hood_status_on_activate(self):
        kid = Kid.objects.create(kid_number=["KID-LOCAL-ACTIVATE"])
        Ean.objects.create(
            kid=kid,
            hood_jv="4062292028939",
            otto_jv="5062292028939",
            ebay_jv="6062292028939",
            kaufland_jv="7062292028939",
        )
        EanStatus.objects.create(
            ean=kid,
            hood_jv=False,
            otto_jv=False,
            ebay_jv=False,
            kaufland_jv=False,
        )

        response = self.client.post(
            "/api/v1/marketplace/local-statuses-by-kid/",
            {"kid_number": "KID-LOCAL-ACTIVATE", "inactive": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["summary"]["failed"], 0)
        site_keys = {row["site_key"]: row for row in response.data["results"]}
        self.assertNotIn("HOOD_JV", site_keys)
        status_row = EanStatus.objects.get(ean=kid)
        self.assertFalse(status_row.hood_jv)
        self.assertTrue(status_row.otto_jv)
        self.assertTrue(status_row.ebay_jv)
        self.assertFalse(status_row.kaufland_jv)

    def test_marketplace_local_statuses_by_kid_is_successful_noop_for_hood_only_mapping(self):
        kid = Kid.objects.create(kid_number=["KID-HOOD-ONLY"])
        Ean.objects.create(kid=kid, hood_jv="4062292028939")
        EanStatus.objects.create(ean=kid, hood_jv=True)

        response = self.client.post(
            "/api/v1/marketplace/local-statuses-by-kid/",
            {"kid_number": "KID-HOOD-ONLY", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["results"][0]["details"]["code"], "marketplace_local_status_no_targets")
        status_row = EanStatus.objects.get(ean=kid)
        self.assertTrue(status_row.hood_jv)

    @patch("database.marketplace_deactivate_service.fetch_source_product_snapshot_by_artikelnr")
    @patch("database.marketplace_deactivate_service.push_product_to_source")
    def test_marketplace_jv_deactivate_sofort_by_kid_uses_jvm_prefix_first(self, mocked_push, mocked_fetch_snapshot):
        kid = Kid.objects.create(kid_number=["KID-JV-SOFORT"], place="4")
        Ean.objects.create(kid=kid, jv="4062292028939")
        mocked_fetch_snapshot.side_effect = [
            {
                "product": {
                    "product_id": 501,
                    "ean": "4062292028939",
                    "model": "JVM4062292028939",
                    "sku": "SKU-501",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 1},
            },
            {
                "product": {
                    "product_id": 502,
                    "ean": "4062292028939",
                    "model": "JVM4062292028939",
                    "sku": "SKU-502",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 1},
            },
            {
                "product": {
                    "product_id": 503,
                    "ean": "4062292028939",
                    "model": "JVM4062292028939",
                    "sku": "SKU-503",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 1},
            },
            {
                "product": {
                    "product_id": 504,
                    "ean": "4062292028939",
                    "model": "JVM4062292028939",
                    "sku": "SKU-504",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 1},
            },
        ]

        response = self.client.post(
            "/api/v1/marketplace/jv/deactivate-sofort-by-kid/",
            {"kid_number": "KID-JV-SOFORT", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["success"], 4)
        self.assertEqual(mocked_fetch_snapshot.call_count, 4)
        first_call = mocked_fetch_snapshot.call_args_list[0]
        self.assertEqual(first_call.args[1], "JVM4062292028939")
        self.assertEqual(mocked_push.call_count, 4)
        status_row = EanStatus.objects.get(ean=kid)
        self.assertFalse(status_row.jv)
        kid.refresh_from_db()
        self.assertEqual(kid.place, "-4")

    @patch("database.marketplace_deactivate_service.fetch_source_product_snapshot_by_artikelnr")
    @patch("database.marketplace_deactivate_service.push_product_to_source")
    def test_marketplace_jv_activate_sofort_by_kid_updates_place_from_request(self, mocked_push, mocked_fetch_snapshot):
        kid = Kid.objects.create(kid_number=["KID-JV-ACTIVATE"], place="-4")
        Ean.objects.create(kid=kid, jv="4062292028939")
        mocked_fetch_snapshot.side_effect = [
            {
                "product": {
                    "product_id": 701,
                    "ean": "4062292028939",
                    "model": "JVM4062292028939",
                    "sku": "SKU-701",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 0,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 1},
            },
            {
                "product": {
                    "product_id": 702,
                    "ean": "4062292028939",
                    "model": "JVM4062292028939",
                    "sku": "SKU-702",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 0,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 1},
            },
            {
                "product": {
                    "product_id": 703,
                    "ean": "4062292028939",
                    "model": "JVM4062292028939",
                    "sku": "SKU-703",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 0,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 1},
            },
            {
                "product": {
                    "product_id": 704,
                    "ean": "4062292028939",
                    "model": "JVM4062292028939",
                    "sku": "SKU-704",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 0,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 1},
            },
        ]

        response = self.client.post(
            "/api/v1/marketplace/jv/deactivate-sofort-by-kid/",
            {"kid_number": "KID-JV-ACTIVATE", "inactive": False, "place": "18"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kid.refresh_from_db()
        self.assertEqual(kid.place, "18")

    @patch("database.marketplace_deactivate_service.fetch_source_product_snapshot_by_artikelnr")
    def test_marketplace_jv_deactivate_sofort_by_kid_falls_back_without_prefix(self, mocked_fetch_snapshot):
        kid = Kid.objects.create(kid_number=["KID-JV-FALLBACK"])
        Ean.objects.create(kid=kid, jv="4062292028939")
        for site_key, product_id in (
            ("JV_DE", 601),
            ("JV_CO_UK", 602),
            ("JV_CH", 603),
            ("JV_AT", 604),
        ):
            ImportedProduct.objects.create(
                site="JV",
                site_key=site_key,
                source_product_id=product_id,
                ean="4062292028939",
                status=True,
            )
        mocked_fetch_snapshot.side_effect = [
            None,
            {
                "product": {
                    "product_id": 601,
                    "ean": "4062292028939",
                    "model": "4062292028939",
                    "sku": "SKU-601",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 0},
            },
            None,
            {
                "product": {
                    "product_id": 602,
                    "ean": "4062292028939",
                    "model": "4062292028939",
                    "sku": "SKU-602",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 0},
            },
            None,
            {
                "product": {
                    "product_id": 603,
                    "ean": "4062292028939",
                    "model": "4062292028939",
                    "sku": "SKU-603",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 0},
            },
            None,
            {
                "product": {
                    "product_id": 604,
                    "ean": "4062292028939",
                    "model": "4062292028939",
                    "sku": "SKU-604",
                    "price": "12.3400",
                    "quantity": 5,
                    "status": 1,
                    "manufacturer_id": 7,
                    "stock_status_id": 8,
                    "tax_class_id": 9,
                    "image": "catalog/demo.jpg",
                    "date_available": "2026-06-25",
                    "date_modified": "2026-06-25 12:00:00",
                },
                "descriptions": [],
                "categories": [],
                "stores": [],
                "images": [],
                "specials": [],
                "jv_fields": {"is_sofort": 0},
            },
        ]

        response = self.client.post(
            "/api/v1/marketplace/jv/deactivate-sofort-by-kid/",
            {"kid_number": "KID-JV-FALLBACK", "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["summary"]["success"], 4)
        self.assertEqual(response.data["results"][0]["details"]["code"], "jv_sofort_already_inactive")
        self.assertEqual(mocked_fetch_snapshot.call_args_list[0].args[1], "JVM4062292028939")
        self.assertEqual(mocked_fetch_snapshot.call_args_list[1].args[1], "4062292028939")
        status_row = EanStatus.objects.get(ean=kid)
        self.assertFalse(status_row.jv)
        for site_key in ("JV_DE", "JV_CO_UK", "JV_CH", "JV_AT"):
            product = ImportedProduct.objects.get(site="JV", site_key=site_key, ean="4062292028939")
            self.assertFalse(product.status)

    @patch("database.marketplace_deactivate_service.sync_children_from_snapshot")
    @patch("database.marketplace_deactivate_service.fetch_source_product_snapshot_by_ean")
    @patch("database.marketplace_deactivate_service.push_product_to_source")
    def test_marketplace_deactivate_by_ean_syncs_from_source_when_local_missing(
        self,
        mocked_push,
        mocked_fetch_snapshot,
        mocked_sync_children,
    ):
        mocked_fetch_snapshot.return_value = {
            "product": {
                "product_id": 202,
                "ean": "4062292028939",
                "sku": "SKU-202",
                "model": "MODEL-202",
                "price": "12.3400",
                "quantity": 5,
                "status": 1,
                "manufacturer_id": 7,
                "stock_status_id": 8,
                "tax_class_id": 9,
                "image": "catalog/demo.jpg",
                "date_available": "2026-06-25",
                "date_modified": "2026-06-25 12:00:00",
            },
            "descriptions": [],
            "categories": [],
            "stores": [],
            "images": [],
            "specials": [],
            "jv_fields": {},
        }

        response = self.client.post(
            "/api/v1/marketplace/deactivate-by-kid/",
            {"ean": "4062292028939", "site_keys": ["JV_DE"], "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["summary"]["success"], 1)
        self.assertTrue(
            ImportedProduct.objects.filter(site="JV", site_key="JV_DE", ean="4062292028939").exists()
        )
        product = ImportedProduct.objects.get(site="JV", site_key="JV_DE", ean="4062292028939")
        self.assertFalse(product.status)
        mocked_fetch_snapshot.assert_called_once()
        mocked_sync_children.assert_called_once()
        mocked_push.assert_called_once()

    def test_marketplace_deactivate_by_ean_requires_explicit_hood_payload(self):
        response = self.client.post(
            "/api/v1/marketplace/deactivate-by-kid/",
            {"ean": "4012345678901", "site_keys": ["HOOD_JV"], "inactive": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_207_MULTI_STATUS)
        self.assertEqual(response.data["status"], "failed")
        self.assertEqual(response.data["results"][0]["channel"], "HOOD")
        self.assertEqual(
            response.data["results"][0]["details"]["code"],
            "marketplace_deactivate_payload_required",
        )

    @patch("database.views.import_kid_green_json_bytes")
    def test_kid_green_import_streams_progress_events(self, mocked_import):
        mocked_import.return_value = KidGreenImportResult(
            total_payloads=1,
            unique_kids=1,
            kid_stats=KidImportStats(created=0, place_appended=0, skipped=1, total_payloads=1),
            order_stats=OrderImportStats(created=1, updated=0, collapsed_positions=3, skipped_without_order_id=0, failed_kids_count=0),
            failed_kids=[],
        )
        uploaded = SimpleUploadedFile(
            "kid_green.json",
            b'[{"kid":"KID-001","place":"A-1"}]',
            content_type="application/json",
        )

        response = self.client.post(
            "/api/v1/kids/import-kid-green/?stream=1",
            {"file": uploaded, "workers": "1"},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/x-ndjson")
        payload = b"".join(response.streaming_content).decode("utf-8")
        self.assertIn('"type": "complete"', payload)
        self.assertIn('"total_payloads": 1', payload)
        mocked_import.assert_called_once()

    @patch("database.kid_green_import_service.fetch_orders_for_kid")
    def test_upsert_orders_for_kids_creates_orders_from_completed_fetches(self, mocked_fetch):
        kid_a = Kid.objects.create(kid_number=["KG-1001"], place=["A-1"])
        kid_b = Kid.objects.create(kid_number=["KG-1002"], place=["A-2"])
        kid_map = {
            "KG-1001": [kid_a],
            "KG-1002": [kid_b],
        }
        mocked_fetch.side_effect = [
            FetchResult(
                kid_number="KG-1001",
                items=[
                    {
                        "order_id": "ORDER-1001",
                        "title": "First item",
                        "sku": "1111111111111",
                        "verkaufsdatum": "24.06.2026 12:00:00",
                        "zahlungssumme": "100,00",
                        "rechnungssumme": "100,00",
                        "memo": "alpha",
                        "platform": "XL",
                        "buyer": "buyer-a",
                    }
                ],
            ),
            FetchResult(
                kid_number="KG-1002",
                items=[
                    {
                        "order_id": "ORDER-1002",
                        "title": "Second item",
                        "sku": "2222222222222",
                        "verkaufsdatum": "24.06.2026 13:00:00",
                        "zahlungssumme": "50,00",
                        "rechnungssumme": "75,00",
                        "memo": "beta",
                        "platform": "JV",
                        "buyer": "buyer-b",
                    }
                ],
            ),
        ]

        failed_kids, order_stats, item_results = upsert_orders_for_kids(
            kid_map,
            max_total=100,
            max_items_per_page=20,
            workers=2,
            timeout_retries=0,
            timeout_retry_delay=0.0,
            show_progress=False,
        )

        self.assertEqual(failed_kids, [])
        self.assertEqual(order_stats.created, 2)
        self.assertEqual(order_stats.updated, 0)
        self.assertEqual(len(item_results), 2)
        self.assertTrue(Orders.objects.filter(kid=kid_a, order_id="ORDER-1001").exists())
        self.assertTrue(Orders.objects.filter(kid=kid_b, order_id="ORDER-1002").exists())

    @patch("database.kid_green_import_service.fetch_orders_for_kid")
    def test_upsert_orders_for_kids_retries_fetch_errors_at_end(self, mocked_fetch):
        kid = Kid.objects.create(kid_number=["KG-2001"], place=["B-1"])
        kid_map = {"KG-2001": [kid]}
        mocked_fetch.side_effect = [
            FetchResult(kid_number="KG-2001", items=[], error="Connection timeout"),
            FetchResult(
                kid_number="KG-2001",
                items=[
                    {
                        "order_id": "ORDER-2001",
                        "title": "Recovered item",
                        "sku": "3333333333333",
                        "verkaufsdatum": "24.06.2026 14:00:00",
                        "zahlungssumme": "75,00",
                        "rechnungssumme": "75,00",
                        "memo": "retry-ok",
                        "platform": "XL",
                        "buyer": "buyer-c",
                    }
                ],
            ),
        ]

        failed_kids, order_stats, item_results = upsert_orders_for_kids(
            kid_map,
            max_total=100,
            max_items_per_page=20,
            workers=1,
            timeout_retries=0,
            timeout_retry_delay=0.0,
            show_progress=False,
        )

        self.assertEqual(failed_kids, [])
        self.assertEqual(order_stats.created, 1)
        self.assertEqual(order_stats.failed_kids_count, 0)
        self.assertEqual(len(item_results), 1)
        self.assertEqual(item_results[0].status, "ok")
        self.assertEqual(item_results[0].orders_created, 1)
        self.assertTrue(Orders.objects.filter(kid=kid, order_id="ORDER-2001").exists())

    def test_list_and_retrieve_kid(self):
        list_response = self.client.get("/api/v1/kids/")
        detail_response = self.client.get(f"/api/v1/kids/{self.kid.id}/")

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data["kid_number"], primary_kid_number(self.kid.kid_number))

    def test_update_kid(self):
        response = self.client.patch(
            f"/api/v1/kids/{self.kid.id}/", {"place": "stoyanka-3000", "section": "b"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.kid.refresh_from_db()
        self.assertEqual(self.kid.place, "stoyanka-3000")
        self.assertEqual(self.kid.section, "B")

    def test_create_and_retrieve_order(self):
        payload = {
            "kid_number": self.kid.kid_number,
            "order_id": "ORDER-002",
            "sku": "1111111111111",
            "title": "New order",
            "memo": "New memo",
            "status": "paid",
            "order_date": "2026-04-07T11:00:00Z",
        }
        create_response = self.client.post("/api/v1/orders/", payload, format="json")
        order_id = create_response.data["id"]
        detail_response = self.client.get(f"/api/v1/orders/{order_id}/")

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data["order_id"], "ORDER-002")

    @patch("database.views.AfterbuyOrderMemoSyncService.sync_order")
    def test_order_memo_update_is_added_to_kid_change_history(self, sync_order):
        sync_order.side_effect = lambda order: order

        response = self.client.patch(
            f"/api/v1/orders/{self.order.id}/",
            {"memo": "Updated memo"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        history_entry = InventoryChangeLog.objects.get(action="order_memo_updated")
        self.assertEqual(history_entry.kid_id, self.kid.id)
        self.assertEqual(
            history_entry.changes,
            [{"field": "order.memo", "before": "Test memo", "after": "Updated memo"}],
        )
        self.assertEqual(
            history_entry.metadata,
            {"entity": "order", "order_db_id": self.order.id, "order_id": "ORDER-001"},
        )
        sync_order.assert_called_once()

    def test_order_exposes_expanded_afterbuy_fields_and_item_positions(self):
        self.order.invoice_number = "INV-100"
        self.order.full_amount = "2834.10"
        self.order.already_paid = Decimal("0.00")
        self.order.invoice_amount = Decimal("2834.10")
        self.order.paid_amount = Decimal("0.00")
        self.order.payment_method = "otto"
        self.order.payment_id = "INVOICE"
        self.order.payment_function = "TRANSFER"
        self.order.save()
        OrderItem.objects.create(
            order=self.order,
            afterbuy_item_id="753100115",
            title="Main item",
            quantity=1,
            item_price=Decimal("2834.10"),
            currency="EUR",
        )

        response = self.client.get(f"/api/v1/orders/{self.order.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["invoice_number"], "INV-100")
        self.assertEqual(response.data["full_amount"], "2834.10")
        self.assertEqual(response.data["payment_method"], "otto")
        self.assertEqual(self.order.items.count(), 1)

    def test_get_order_ids_by_kid_id(self):
        response = self.client.get(f"/api/v1/kids/{self.kid.id}/order-ids/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"kid_id": self.kid.id, "order_ids": ["ORDER-001"]})

    def test_get_kid_ean_summary(self):
        self.kid.place = "A-01"
        self.kid.room = "ROOM-1"
        self.kid.furniture_type = "chair"
        self.kid.photo = ["https://cdn.example.com/photo-main.jpg"]
        self.kid.save(update_fields=["place", "room", "furniture_type", "photo"])

        self.order.additional_items = [
            {"sku": "extra sku 4006381333931"},
            {"sku": "second sku 5901234123457"},
        ]
        self.order.save(update_fields=["additional_items"])

        response = self.client.get(f"/api/v1/kids/{self.kid.id}/ean-summary/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kid_id"], self.kid.id)
        self.assertEqual(response.data["kid_number"], primary_kid_number(self.kid.kid_number))
        self.assertEqual(response.data["order_count"], 1)
        self.assertEqual(response.data["order_ids"], ["ORDER-001"])
        self.assertIn("1234567890123", response.data["sku_eans"])
        self.assertIn("4006381333931", response.data["sku_eans"])
        self.assertIn("5901234123457", response.data["sku_eans"])
        self.assertEqual(response.data["sku_ean_count"], 3)
        self.assertTrue(response.data["has_ean"])
        self.assertIn("linked_products_by_ean", response.data)
        self.assertIn("xljv_services", response.data["linked_products_by_ean"])
        self.assertIn("hood_service", response.data["linked_products_by_ean"])
        self.assertIn("listing_summary", response.data)
        self.assertEqual(response.data["listing_summary"]["xljv_services"]["total"], 0)
        self.assertEqual(response.data["listing_summary"]["xljv_services"]["sites"], [])
        self.assertEqual(
            response.data["listing_summary"]["xljv_services"]["source_product_ids"], []
        )
        self.assertEqual(response.data["listing_summary"]["hood_service"]["total"], 0)
        self.assertEqual(response.data["listing_summary"]["hood_service"]["accounts"], [])
        self.assertIn("kid_snapshot", response.data)
        self.assertEqual(response.data["kid_snapshot"]["place"], "A-01")
        self.assertEqual(response.data["kid_snapshot"]["room"], "ROOM-1")
        self.assertEqual(response.data["kid_snapshot"]["furniture_type"], "chair")
        self.assertEqual(response.data["kid_snapshot"]["main_ean"], "")
        self.assertEqual(response.data["kid_snapshot"]["database_ean"], "")
        self.assertEqual(
            response.data["kid_snapshot"]["main_photo"],
            "https://cdn.example.com/photo-main.jpg",
        )
        self.assertEqual(response.data["kid_snapshot"]["photo_count"], 1)
        self.assertIn("marketplace_identity_preview", response.data)
        self.assertEqual(len(response.data["marketplace_identity_preview"]), 3)
        self.assertIn("inventory_flags", response.data)
        self.assertFalse(response.data["inventory_flags"]["missing_place"])
        self.assertFalse(response.data["inventory_flags"]["missing_room"])
        self.assertFalse(response.data["inventory_flags"]["missing_photo"])

    def test_marketplace_eans_patch_updates_database_ean(self):
        ean_row = Ean.objects.create(
            kid=self.kid,
            main_ean="0000000000000",
            jv="0000000000000",
            xl="0000000000000",
            otto_jv="0000000000000",
            otto_xl="0000000000000",
            kaufland_jv="0000000000000",
            kaufland_xl="0000000000000",
            hood_jv="0000000000000",
            hood_xl="0000000000000",
            ebay_jv="0000000000000",
            ebay_xl="0000000000000",
        )

        payload = {
            "main_ean": "4444444444444",
            "database_ean": "4444444444444",
            "cosmoshop_ean": "4444444444444",
            "opencart_ean": "4444444444444",
            "otto_jv_ean": "4444444444444",
            "otto_xl_ean": "4444444444444",
            "ebay_jv_ean": "4444444444444",
            "ebay_xl_ean": "4444444444444",
            "kaufland_jv_ean": "4444444444444",
            "kaufland_xl_ean": "4444444444444",
            "hood_jv_ean": "4444444444444",
            "hood_xl_ean": "4444444444444",
        }

        response = self.client.patch(f"/api/v1/kids/{self.kid.id}/marketplace-eans/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ean_row.refresh_from_db()
        self.assertEqual(ean_row.main_ean, "4444444444444")
        self.assertEqual(ean_row.jv, "4444444444444")
        self.assertEqual(response.data["main_ean"], "4444444444444")
        self.assertEqual(response.data["database_ean"], "4444444444444")
        self.assertEqual(response.data["cosmoshop_ean"], "4444444444444")

    def test_marketplace_eans_patch_allows_b_ware_for_otto_only(self):
        response = self.client.patch(
            f"/api/v1/kids/{self.kid.id}/marketplace-eans/",
            {"otto_jv_ean": "b-ware", "otto_xl_ean": "B_WARE"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["otto_jv_ean"], "B_WARE")
        self.assertEqual(response.data["otto_xl_ean"], "B_WARE")

    def test_marketplace_eans_get_hides_placeholder_values(self):
        Ean.objects.create(
            kid=self.kid,
            main_ean="0000000000000",
            jv="0000000000000",
            xl="0000000000000",
            otto_jv="0000000000000",
            otto_xl="0000000000000",
            kaufland_jv="0000000000000",
            kaufland_xl="0000000000000",
            hood_jv="0000000000000",
            hood_xl="0000000000000",
            ebay_jv="0000000000000",
            ebay_xl="0000000000000",
        )

        response = self.client.get(f"/api/v1/kids/{self.kid.id}/marketplace-eans/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["main_ean"], "")
        self.assertEqual(response.data["database_ean"], "")
        self.assertEqual(response.data["cosmoshop_ean"], "")
        self.assertEqual(response.data["opencart_ean"], "")
        self.assertEqual(response.data["otto_jv_ean"], "")
        self.assertEqual(response.data["otto_xl_ean"], "")
        self.assertEqual(response.data["ebay_jv_ean"], "")
        self.assertEqual(response.data["ebay_xl_ean"], "")
        self.assertEqual(response.data["kaufland_jv_ean"], "")
        self.assertEqual(response.data["kaufland_xl_ean"], "")
        self.assertEqual(response.data["hood_jv_ean"], "")
        self.assertEqual(response.data["hood_xl_ean"], "")

    @patch("jv_services.views_write.record_ean_usage")
    @patch("jv_services.views_write.create_product_in_source", return_value=777)
    @patch("jv_services.views_write.push_product_to_source")
    @patch("jv_services.views_write.source_db_config_for_site", return_value={"host": "test", "user": "test", "password": "test", "database": "test", "port": 3306})
    def test_jv_update_by_ean_recreates_when_source_product_id_is_invalid(
        self,
        mocked_db_config,
        mocked_push,
        mocked_create_source,
        mocked_record_usage,
    ):
        product = ImportedProduct.objects.create(
            site="JV",
            site_key="JV_DE",
            source_product_id=0,
            ean="4062292001215",
            source_model="JVM4062292001215",
            price="12.3400",
            quantity=1,
            status=True,
        )
        mocked_push.side_effect = [RuntimeError("invalid JV source_product_id"), None]

        response = self.client.patch(
            "/api/v1/jv/products/update-by-ean/4062292001215/?site=JV&site_key=JV_DE",
            {"source_model": "JVM4062292001215", "price": "99.9900"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product.refresh_from_db()
        self.assertEqual(product.source_product_id, 777)
        self.assertEqual(str(product.price), "99.9900")
        self.assertEqual(mocked_push.call_count, 2)
        mocked_create_source.assert_called_once()
        mocked_record_usage.assert_called_once()
        mocked_db_config.assert_called()

    @patch("jv_services.source_push._push_product_to_source_once")
    @patch("jv_services.source_push.create_product_in_source", return_value=888)
    @patch("jv_services.views_write_children.record_ean_usage")
    def test_jv_source_push_recreates_missing_article_in_shared_push_path(
        self,
        mocked_record_usage,
        mocked_create_source,
        mocked_push_once,
    ):
        product = ImportedProduct.objects.create(
            site="JV",
            site_key="JV_CO_UK",
            source_product_id=465915,
            ean="4062292001215",
            source_model="JVM4062292001215",
            price="12.3400",
            quantity=1,
            status=True,
        )
        mocked_push_once.side_effect = [RuntimeError("JV article not found for artikelid=465915"), None]

        push_product_to_source(
            {"host": "test", "user": "test", "password": "test", "database": "test", "port": 3306},
            product,
            changed_scalar_fields={"price"},
            changed_relations={"specials"},
        )

        product.refresh_from_db()
        self.assertEqual(product.source_product_id, 888)
        self.assertEqual(mocked_push_once.call_count, 2)
        mocked_create_source.assert_called_once()
        mocked_record_usage.assert_called_once()

    def test_get_kid_ean_summary_not_found(self):
        response = self.client.get("/api/v1/kids/999999/ean-summary/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_order_validation_for_status(self):
        payload = {
            "kid_number": self.kid.kid_number,
            "order_id": "ORDER-003",
            "sku": "short",
            "title": "Bad order",
            "memo": "Bad memo",
            "status": "unknown",
            "order_date": "2026-04-07T11:00:00Z",
        }
        response = self.client.post("/api/v1/orders/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", response.data)

    def test_create_order_without_kid_fails(self):
        payload = {
            "order_id": "ORDER-004",
            "title": "No kid order",
            "status": "paid",
        }
        response = self.client.post("/api/v1/orders/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("kid_number", response.data)

    def test_create_duplicate_order_for_same_kid_fails(self):
        payload = {
            "kid_number": self.kid.kid_number,
            "order_id": "ORDER-001",
            "title": "Updated title",
            "status": "paid",
        }
        response = self.client.post("/api/v1/orders/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Orders.objects.filter(kid=self.kid, order_id="ORDER-001").count(), 1)
        self.assertIn("non_field_errors", response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.title, "Test order")
        self.assertEqual(self.order.status, "no_paid")

    def test_update_existing_order(self):
        payload = {
            "title": "Updated title",
            "status": "paid",
        }
        response = self.client.patch(
            f"/api/v1/orders/{self.order.id}/", payload, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.title, "Updated title")
        self.assertEqual(self.order.status, "paid")

    def test_cannot_change_order_kid(self):
        second_kid = Kid.objects.create(kid_number="777777")
        response = self.client.patch(
            f"/api/v1/orders/{self.order.id}/",
            {"kid_number": second_kid.kid_number},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("kid", response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.kid_id, self.kid.id)

    def test_user_can_only_read_kid_numbers_and_orders(self):
        self.set_session_role("user")

        kids_response = self.client.get("/api/v1/kids/")
        orders_response = self.client.get("/api/v1/orders/")

        self.assertEqual(kids_response.status_code, status.HTTP_200_OK)
        self.assertEqual(orders_response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(kids_response.data[0].keys()), {"kid_number"})
        self.assertEqual(set(orders_response.data[0].keys()), {"order_id", "kid_number"})

    def test_user_cannot_create_or_update(self):
        self.set_session_role("user")

        create_response = self.client.post(
            "/api/v1/orders/",
            {
                "kid_number": self.kid.kid_number,
                "order_id": "ORDER-999",
                "title": "No access",
                "status": "paid",
            },
            format="json",
        )
        update_response = self.client.patch(
            f"/api/v1/orders/{self.order.id}/",
            {"title": "No access"},
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_delete_order(self):
        response = self.client.delete(f"/api/v1/orders/{self.order.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Orders.objects.filter(id=self.order.id).exists())

    def test_user_cannot_delete_order(self):
        self.set_session_role("user")
        response = self.client.delete(f"/api/v1/orders/{self.order.id}/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Orders.objects.filter(id=self.order.id).exists())

    def test_inventory_rows_default_pagination(self):
        response = self.client.get("/api/v1/inventory/rows/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertIn("count", response.data)
        self.assertIn("page_size", response.data)
        self.assertEqual(response.data["page_size"], 100)
        self.assertGreaterEqual(response.data["count"], 1)
        self.assertIsInstance(response.data["results"], list)

    def test_inventory_rows_filter_by_kid_id(self):
        second_kid = Kid.objects.create(kid_number="KID-SECOND-1")
        Orders.objects.create(
            kid=second_kid,
            order_id="ORDER-SECOND-001",
            sku="9999999999999",
            title="Second kid order",
            memo="Second memo",
            status="no_paid",
            order_date="2026-04-06T12:00:00Z",
        )

        response = self.client.get(f"/api/v1/inventory/rows/?kid_id={self.kid.id}&page_size=100")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertTrue(rows)
        self.assertTrue(all(row["kid_id"] == self.kid.id for row in rows))

    def test_kids_bulk_update_room_and_type(self):
        second_kid = Kid.objects.create(kid_number="KID-SECOND-2")
        payload = {
            "updates": [
                {"kid_id": self.kid.id, "room": RU_LIVING_ROOM, "type": RU_SOFA},
                {"kid_id": second_kid.id, "room": RU_KITCHEN, "type": RU_TABLE},
            ]
        }

        response = self.client.patch("/api/v1/kids/bulk-update/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated"], 2)
        self.kid.refresh_from_db()
        second_kid.refresh_from_db()
        self.assertEqual(self.kid.room, RU_LIVING_ROOM)
        self.assertEqual(second_kid.room, RU_KITCHEN)
        self.assertEqual(self.kid.furniture_type, RU_SOFA)
        self.assertEqual(second_kid.furniture_type, RU_TABLE)

    def test_kids_bulk_update_product_attributes(self):
        payload = {
            "updates": [
                {
                    "kid_id": self.kid.id,
                    "quantity": 6,
                    "company": "House Brand",
                    "color": "White",
                    "size": "90x200",
                    "material": "Metal",
                    "price": "199.50",
                }
            ]
        }

        response = self.client.patch("/api/v1/kids/bulk-update/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        attrs = ProductAttributes.objects.get(kid=self.kid)
        self.assertEqual(attrs.quantity, 6)
        self.assertEqual(attrs.company, "House Brand")
        self.assertEqual(attrs.color, "White")
        self.assertEqual(attrs.size, "90x200")
        self.assertEqual(attrs.material, "Metal")
        self.assertEqual(str(attrs.price), "199.50")

    def test_inventory_rows_use_product_attributes_quantity_for_order_rows(self):
        ProductAttributes.objects.create(
            kid=self.kid,
            quantity=9,
            company="Blue Label",
            color="Blue",
        )

        response = self.client.get(f"/api/v1/inventory/rows/?kid_id={self.kid.id}&page_size=100")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertTrue(rows)
        row = rows[0]
        self.assertEqual(row["quantity"], 9)
        self.assertEqual(row["company"], "Blue Label")
        self.assertEqual(row["color"], "Blue")
        self.assertEqual(row["order_id"], "ORDER-001")

    def test_inventory_rows_filter_by_room_type_and_query(self):
        self.kid.room = RU_LIVING_ROOM
        self.kid.furniture_type = RU_SOFA
        self.kid.save(update_fields=["room", "furniture_type"])

        response = self.client.get(
            f"/api/v1/inventory/rows/?room={RU_LIVING_ROOM}&type={RU_SOFA}&q=13234455"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertTrue(rows)
        self.assertTrue(all(row["room"] == RU_LIVING_ROOM for row in rows))
        self.assertTrue(all(row["type"] == RU_SOFA for row in rows))

    def test_inventory_rows_filter_by_place_location_quantity_and_attributes(self):
        self.kid.place = "A-12-BLUE"
        self.kid.section = "Z"
        self.kid.room = "Wohnzimmer"
        self.kid.furniture_type = "Corner Sofa"
        self.kid.store = True
        self.kid.save(update_fields=["place", "section", "room", "furniture_type", "store"])
        ProductAttributes.objects.create(
            kid=self.kid,
            quantity=7,
            company="Nordic House",
            color="Ocean Blue",
            material="Soft Velvet",
        )

        other_kid = Kid.objects.create(
            kid_number="FILTER-OTHER-001",
            place="B-99",
            room="Bedroom",
            furniture_type="Chair",
            store=False,
        )
        ProductAttributes.objects.create(
            kid=other_kid,
            quantity=3,
            company="Other Brand",
            color="White",
            material="Wood",
        )
        similar_quantity_kid = Kid.objects.create(
            kid_number="FILTER-OTHER-017",
            place="C-17",
            room="Office",
            furniture_type="Desk",
            store=False,
        )
        ProductAttributes.objects.create(
            kid=similar_quantity_kid,
            quantity=17,
            company="Seventeen Brand",
            color="Green",
            material="Metal",
        )

        response = self.client.get(
            "/api/v1/inventory/rows/?"
            "place=A-12-BLUE&section=Z&location=store&quantity=7&room=wohn&type=corner"
            "&company=nordic&color=ocean&material=velvet&page_size=100"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertTrue(rows)
        self.assertTrue(all(row["place"] == "A-12-BLUE" for row in rows))
        self.assertTrue(all(row["section"] == "Z" for row in rows))
        self.assertTrue(all(row["quantity"] == 7 for row in rows))
        self.assertTrue(all(str(row["room"]).lower() == "wohnzimmer" for row in rows))
        self.assertTrue(all(str(row["type"]).lower() == "corner sofa" for row in rows))
        self.assertTrue(all(str(row["company"]).lower() == "nordic house" for row in rows))
        self.assertTrue(all(str(row["color"]).lower() == "ocean blue" for row in rows))
        self.assertTrue(all(str(row["material"]).lower() == "soft velvet" for row in rows))
        self.assertTrue(all(bool(row["store"]) is True for row in rows))
        self.assertFalse(any(int(row["kid_id"]) == other_kid.id for row in rows))

        quantity_partial = self.client.get("/api/v1/inventory/rows/?quantity=7&page_size=100")
        self.assertEqual(quantity_partial.status_code, status.HTTP_200_OK)
        quantity_rows = quantity_partial.data["results"]
        self.assertTrue(quantity_rows)
        self.assertTrue(any(int(row["kid_id"]) == self.kid.id for row in quantity_rows))
        self.assertFalse(any(int(row["kid_id"]) == similar_quantity_kid.id for row in quantity_rows))

    def test_inventory_rows_default_place_sort_is_ascending_and_empty_places_last(self):
        self.kid.place = "B-99"
        self.kid.save(update_fields=["place"])
        ProductAttributes.objects.create(kid=self.kid, quantity=1)

        first_kid = Kid.objects.create(
            kid_number="PLACE-SORT-001",
            place="A-12",
            store=False,
        )
        ProductAttributes.objects.create(kid=first_kid, quantity=1)

        empty_place_kid = Kid.objects.create(
            kid_number="PLACE-SORT-EMPTY",
            place="",
            store=False,
        )
        ProductAttributes.objects.create(kid=empty_place_kid, quantity=1)

        response = self.client.get("/api/v1/inventory/rows/?page_size=100")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertGreaterEqual(len(rows), 3)

        relevant_rows = [
            row
            for row in rows
            if int(row["kid_id"]) in {self.kid.id, first_kid.id, empty_place_kid.id}
        ]
        self.assertEqual(
            [int(row["kid_id"]) for row in relevant_rows],
            [first_kid.id, self.kid.id, empty_place_kid.id],
        )
        self.assertEqual([row["place"] for row in relevant_rows], ["A-12", "B-99", ""])
        self.assertTrue(all(int(row["quantity"]) == 7 for row in quantity_rows))

    def test_inventory_rows_default_place_sort_uses_natural_order(self):
        self.kid.place = "10"
        self.kid.save(update_fields=["place"])
        ProductAttributes.objects.create(kid=self.kid, quantity=1)

        place_1 = Kid.objects.create(
            kid_number="PLACE-NATURAL-001",
            place="1",
            store=False,
        )
        ProductAttributes.objects.create(kid=place_1, quantity=1)

        place_1a = Kid.objects.create(
            kid_number="PLACE-NATURAL-001A",
            place="1A",
            store=False,
        )
        ProductAttributes.objects.create(kid=place_1a, quantity=1)

        place_1b = Kid.objects.create(
            kid_number="PLACE-NATURAL-001B",
            place="1B",
            store=False,
        )
        ProductAttributes.objects.create(kid=place_1b, quantity=1)

        place_2 = Kid.objects.create(
            kid_number="PLACE-NATURAL-002",
            place="2",
            store=False,
        )
        ProductAttributes.objects.create(kid=place_2, quantity=1)

        response = self.client.get("/api/v1/inventory/rows/?page_size=100")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        relevant_rows = [
            row
            for row in rows
            if int(row["kid_id"]) in {self.kid.id, place_1.id, place_1a.id, place_1b.id, place_2.id}
        ]
        self.assertEqual(
            [row["place"] for row in relevant_rows],
            ["1", "1A", "1B", "2", "10"],
        )

    def test_inventory_rows_merge_multiple_orders_under_same_kid(self):
        Orders.objects.create(
            kid=self.kid,
            order_id="ORDER-002, ORDER-002-A",
            sku="4006381333931",
            title="Second order title",
            memo="Second order memo",
            status="paid",
            full_amount="249.99 EUR",
            buyer="Second Buyer",
            platform="ebay",
            order_date="2026-04-07T12:00:00Z",
        )

        response = self.client.get(f"/api/v1/inventory/rows/?kid_id={self.kid.id}&page_size=100")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["entity"], "kid")
        self.assertEqual(row["order_id"], "ORDER-001")
        self.assertEqual(row["additional_order_ids_text"], "ORDER-002, ORDER-002-A")
        self.assertEqual(row["buyer"], "Second Buyer")
        self.assertEqual(row["full_amount"], "249.99 EUR")
        self.assertEqual(row["global_price"], "249.99 EUR")
        self.assertIn("13234455", row["sku_eans"])
        self.assertIn("4006381333931", row["sku_eans"])
        self.assertEqual(row["status"], "no_paid | paid")

    def test_inventory_rows_can_filter_by_b_ware_and_in_transit(self):
        self.kid.b_ware = True
        self.kid.in_transit = True
        self.kid.save(update_fields=["b_ware", "in_transit"])

        other_kid = Kid.objects.create(
            kid_number="FILTER-FLAGS-002",
            place="88",
            b_ware=False,
            in_transit=False,
        )
        Orders.objects.create(
            kid=other_kid,
            order_id="ORDER-FLAGS-002",
            sku="4006381333932",
            title="Flags order",
            memo="Flags memo",
            status="no_paid",
            order_date="2026-04-08T10:00:00Z",
        )

        b_ware_response = self.client.get("/api/v1/inventory/rows/?b_ware=true&page_size=100")
        self.assertEqual(b_ware_response.status_code, status.HTTP_200_OK)
        b_ware_ids = {row["kid_id"] for row in b_ware_response.data["results"]}
        self.assertIn(self.kid.id, b_ware_ids)
        self.assertNotIn(other_kid.id, b_ware_ids)

        in_transit_response = self.client.get("/api/v1/inventory/rows/?in_transit=true&page_size=100")
        self.assertEqual(in_transit_response.status_code, status.HTTP_200_OK)
        in_transit_ids = {row["kid_id"] for row in in_transit_response.data["results"]}
        self.assertIn(self.kid.id, in_transit_ids)
        self.assertNotIn(other_kid.id, in_transit_ids)

    def test_inventory_filter_options_return_distinct_values_from_all_rows(self):
        self.kid.place = "A-12-BLUE"
        self.kid.room = "Wohnzimmer"
        self.kid.furniture_type = "Corner Sofa"
        self.kid.store = True
        self.kid.save(update_fields=["place", "room", "furniture_type", "store"])
        ProductAttributes.objects.create(
            kid=self.kid,
            quantity=7,
            company="Ganasy",
            color="Ocean Blue",
            material="Velvet",
        )

        other_kid = Kid.objects.create(
            kid_number="FILTER-OPTIONS-002",
            place="B-99",
            room="Bedroom",
            furniture_type="Chair",
            store=False,
        )
        ProductAttributes.objects.create(
            kid=other_kid,
            quantity=3,
            company="Other Brand",
            color="White",
            material="Wood",
        )

        response = self.client.get("/api/v1/inventory/filter-options/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["locations"], ["warehouse", "store"])
        self.assertIn("A-12-BLUE", response.data["places"])
        self.assertIn("1", response.data["available_places"])
        self.assertIn("Z", response.data["sections"])
        self.assertIn("B-99", response.data["places"])
        self.assertIn("7", response.data["quantities"])
        self.assertIn("3", response.data["quantities"])
        self.assertIn("Wohnzimmer", response.data["rooms"])
        self.assertIn("Bedroom", response.data["rooms"])
        self.assertIn("Corner Sofa", response.data["types"])
        self.assertIn("Chair", response.data["types"])
        self.assertIn("Ganasy", response.data["companies"])
        self.assertIn("Other Brand", response.data["companies"])
        self.assertIn("Ocean Blue", response.data["colors"])
        self.assertIn("White", response.data["colors"])
        self.assertIn("Velvet", response.data["materials"])
        self.assertIn("Wood", response.data["materials"])

    def test_inventory_filter_options_return_places_in_natural_order(self):
        self.kid.place = "10"
        self.kid.save(update_fields=["place"])
        ProductAttributes.objects.create(kid=self.kid, quantity=1)

        for kid_number, place in (
            ("FILTER-PLACE-001", "1"),
            ("FILTER-PLACE-001A", "1A"),
            ("FILTER-PLACE-001B", "1B"),
            ("FILTER-PLACE-002", "2"),
        ):
            kid = Kid.objects.create(
                kid_number=kid_number,
                place=place,
                store=False,
            )
            ProductAttributes.objects.create(kid=kid, quantity=1)

        response = self.client.get("/api/v1/inventory/filter-options/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["places"][:5], ["1", "1A", "1B", "2", "10"])
        self.assertEqual(response.data["available_places"][:6], ["3", "4", "5", "6", "7", "8"])

    def test_inventory_filter_options_keep_base_place_available_when_only_subplace_is_used(self):
        self.kid.place = "1A"
        self.kid.save(update_fields=["place"])
        ProductAttributes.objects.create(kid=self.kid, quantity=1)

        response = self.client.get("/api/v1/inventory/filter-options/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("1", response.data["available_places"])

    def test_inventory_rows_query_searches_across_kid_order_attributes_and_ean_fields(self):
        self.kid.place = "Place 12"
        self.kid.room = "Wohnzimmer"
        self.kid.furniture_type = "Sofa"
        self.kid.commentary = "commentary token"
        self.kid.store = True
        self.kid.save(update_fields=["place", "room", "furniture_type", "commentary", "store"])
        self.order.order_id = "ORDER-SEARCH-777"
        self.order.title = "Title Search Token"
        self.order.memo = "Memo Search Token"
        self.order.sku = "SKU-SEARCH-999"
        self.order.full_amount = "1560.00 EUR"
        self.order.save(update_fields=["order_id", "title", "memo", "sku", "full_amount"])
        ProductAttributes.objects.create(
            kid=self.kid,
            quantity=3,
            company="bathtub",
            color="Black",
            size="360x821x152cm",
            material="Stoff",
            price="1560.00",
            currency="EUR",
        )
        Ean.objects.create(
            kid=self.kid,
            main_ean="5555555555555",
            jv="1111111111111",
            xl="2222222222222",
            otto_jv="3333333333333",
            otto_xl="4444444444444",
            ebay_jv="6666666666666",
            ebay_xl="7777777777777",
            kaufland_jv="8888888888888",
            kaufland_xl="9999999999999",
            hood_jv="1212121212121",
            hood_xl="3434343434343",
        )

        cases = (
            "commentary token",
            "bathtub",
            "360x821x152cm",
            "ORDER-SEARCH-777",
            "Title Search Token",
            "SKU-SEARCH-999",
            "5555555555555",
            "3333333333333",
        )

        for query in cases:
            response = self.client.get(f"/api/v1/inventory/rows/?q={query}&page_size=100")
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            rows = response.data["results"]
            self.assertTrue(rows, msg=f"Expected rows for query {query!r}")
            self.assertTrue(any(int(row["kid_id"]) == self.kid.id for row in rows), msg=f"Expected kid row for query {query!r}")

    def test_inventory_rows_query_supports_field_scoped_prefixes(self):
        self.kid.room = "Wohnzimmer"
        self.kid.furniture_type = "Sofa"
        self.kid.commentary = "special sofa note"
        self.kid.save(update_fields=["room", "furniture_type", "commentary"])
        ProductAttributes.objects.create(
            kid=self.kid,
            quantity=3,
            company="bathtub",
            color="Black",
            size="360x821x152cm",
            material="Stoff",
            price="1560.00",
            currency="EUR",
        )

        other_kid = Kid.objects.create(
            kid_number="99887766",
            room="Bedroom",
            furniture_type="Chair",
            commentary="has sofa only in commentary",
        )
        ProductAttributes.objects.create(
            kid=other_kid,
            quantity=13,
            company="other-brand",
        )

        scoped_type = self.client.get("/api/v1/inventory/rows/?q=type%20sofa&page_size=100")
        self.assertEqual(scoped_type.status_code, status.HTTP_200_OK)
        type_rows = scoped_type.data["results"]
        self.assertTrue(type_rows)
        self.assertTrue(all(str(row["type"]).lower() == "sofa" for row in type_rows))
        self.assertFalse(any(int(row["kid_id"]) == other_kid.id for row in type_rows))

        scoped_quantity = self.client.get("/api/v1/inventory/rows/?q=quantity%203&page_size=100")
        self.assertEqual(scoped_quantity.status_code, status.HTTP_200_OK)
        quantity_rows = scoped_quantity.data["results"]
        self.assertTrue(quantity_rows)
        self.assertTrue(all(int(row["quantity"] or 0) == 3 for row in quantity_rows))
        self.assertFalse(any(int(row["kid_id"]) == other_kid.id for row in quantity_rows))

        global_sofa = self.client.get("/api/v1/inventory/rows/?q=sofa&page_size=100")
        self.assertEqual(global_sofa.status_code, status.HTTP_200_OK)
        global_rows = global_sofa.data["results"]
        self.assertTrue(any(int(row["kid_id"]) == self.kid.id for row in global_rows))
        self.assertFalse(any(int(row["kid_id"]) == other_kid.id for row in global_rows))

    def test_inventory_rows_return_orphan_kid_rows_without_orders(self):
        self.order.delete()
        self.kid.room = "ROOM-X"
        self.kid.furniture_type = "SOFA"
        self.kid.save(update_fields=["room", "furniture_type"])
        ProductAttributes.objects.create(
            kid=self.kid,
            quantity=4,
            company="Nordic House",
            color="Black",
            size="200x80",
            material="Wood",
        )

        response = self.client.get(f"/api/v1/inventory/rows/?kid_id={self.kid.id}&page_size=100")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["entity"], "kid")
        self.assertIsNone(rows[0]["order_db_id"])
        self.assertEqual(rows[0]["order_id"], "-")
        self.assertEqual(rows[0]["room"], "ROOM-X")
        self.assertEqual(rows[0]["type"], "SOFA")
        self.assertEqual(rows[0]["quantity"], 4)
        self.assertEqual(rows[0]["company"], "Nordic House")

    def test_inventory_rows_include_direct_database_order_fields(self):
        self.order.buyer = "John Buyer"
        self.order.full_amount = "199.99 EUR"
        self.order.additional_items = [{"order_id": "ORDER-001-A"}, {"order_id": "ORDER-001-B"}]
        self.order.save(update_fields=["buyer", "full_amount", "additional_items"])

        response = self.client.get(f"/api/v1/inventory/rows/?kid_id={self.kid.id}&page_size=100")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertTrue(rows)
        row = rows[0]
        self.assertEqual(row["buyer"], "John Buyer")
        self.assertEqual(row["full_amount"], "199.99 EUR")
        self.assertEqual(row["global_price"], "199.99 EUR")
        self.assertEqual(row["order_id"], "ORDER-001")
        self.assertEqual(row["additional_order_ids_text"], "ORDER-001-A, ORDER-001-B")

    @patch("database.views.build_inventory_rows")
    def test_inventory_rows_returns_structured_500_on_schema_error(self, mocked_build_inventory_rows):
        mocked_build_inventory_rows.side_effect = ProgrammingError("missing column database_kid.section")

        response = self.client.get("/api/v1/inventory/rows/", HTTP_X_REQUEST_ID="req-test-500")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data["code"], "INVENTORY_ROWS_SCHEMA_ERROR")
        self.assertEqual(response.data["request_id"], "req-test-500")
        self.assertIn("hint", response.data["details"])
