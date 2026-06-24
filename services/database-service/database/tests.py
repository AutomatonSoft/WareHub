from django.db.utils import ProgrammingError
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from .kid_green_import_service import KidGreenImportResult, KidImportStats, OrderImportStats
from .kid_number_utils import primary_kid_number
from .models import Ean, Kid, Orders, ProductAttributes
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
            date="2026-04-06T10:00:00Z",
        )

    def test_primary_kid_number_uses_last_list_item(self):
        self.kid.kid_number = ["OLD-001", "OLD-002", "NEW-003"]
        self.kid.save(update_fields=["kid_number"])

        self.kid.refresh_from_db()

        self.assertEqual(primary_kid_number(self.kid.kid_number), "NEW-003")

    def test_create_kid(self):
        payload = {"kid_number": "900900"}
        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Kid.objects.filter(kid_number__contains=["900900"]).count(), 1)
        kid = Kid.objects.get(kid_number__contains=["900900"])
        ean_row = Ean.objects.get(kid=kid)
        self.assertEqual(ean_row.main_ean, "0000000000000")
        self.assertEqual(ean_row.jv, "0000000000000")
        self.assertEqual(ean_row.xl, "0000000000000")
        self.assertEqual(ean_row.otto_jv, "0000000000000")
        self.assertEqual(ean_row.otto_xl, "0000000000000")
        self.assertEqual(ean_row.kaufland_jv, "0000000000000")
        self.assertEqual(ean_row.kaufland_xl, "0000000000000")
        self.assertEqual(ean_row.hood_jv, "0000000000000")
        self.assertEqual(ean_row.hood_xl, "0000000000000")
        self.assertEqual(ean_row.ebay_jv, "0000000000000")
        self.assertEqual(ean_row.ebay_xl, "0000000000000")

    @patch.object(KidListCreateAPIView, "_ensure_marketplace_ean_defaults")
    def test_create_kid_initializes_marketplace_ean_defaults(self, mocked_sync):
        payload = {"kid_number": "900902"}

        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mocked_sync.assert_called_once()
        synced_kid = mocked_sync.call_args.args[0]
        self.assertEqual(primary_kid_number(synced_kid.kid_number), "900902")

    @patch.object(KidListCreateAPIView, "_ensure_database_ean_defaults")
    def test_create_kid_initializes_database_ean_defaults(self, mocked_sync):
        payload = {"kid_number": "900903"}

        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mocked_sync.assert_called_once()
        synced_kid = mocked_sync.call_args.args[0]
        self.assertEqual(primary_kid_number(synced_kid.kid_number), "900903")

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

    def test_create_kid_is_idempotent_by_kid_number(self):
        payload = {"kid_number": self.kid.kid_number, "place": "A1"}
        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Kid.objects.filter(kid_number__contains=[primary_kid_number(self.kid.kid_number)]).count(),
            1,
        )
        self.kid.refresh_from_db()
        self.assertEqual(self.kid.place, "A1")

    def test_create_kid_is_idempotent_and_updates_inventory_fields(self):
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
            "listing_status": "listed",
            "commentary": "Updated note",
            "b_ware": True,
            "in_transit": True,
            "photo": ["https://cdn.example.com/photo-main.jpg"],
        }

        response = self.client.post("/api/v1/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.kid.refresh_from_db()
        self.assertEqual(self.kid.place, "A-01")
        self.assertEqual(self.kid.room, "Wohnzimmer")
        self.assertEqual(self.kid.furniture_type, "Sofa")
        self.assertEqual(self.kid.listing_status, "listed")
        self.assertEqual(self.kid.commentary, "Updated note")
        self.assertTrue(self.kid.b_ware)
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

    def test_list_and_retrieve_kid(self):
        list_response = self.client.get("/api/v1/kids/")
        detail_response = self.client.get(f"/api/v1/kids/{self.kid.id}/")

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data["kid_number"], primary_kid_number(self.kid.kid_number))

    def test_update_kid(self):
        response = self.client.patch(
            f"/api/v1/kids/{self.kid.id}/", {"place": "stoyanka-3000"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.kid.refresh_from_db()
        self.assertEqual(self.kid.place, "stoyanka-3000")

    def test_create_and_retrieve_order(self):
        payload = {
            "kid_number": self.kid.kid_number,
            "order_id": "ORDER-002",
            "sku": "1111111111111",
            "title": "New order",
            "memo": "New memo",
            "status": "paid",
            "date": "2026-04-07T11:00:00Z",
        }
        create_response = self.client.post("/api/v1/orders/", payload, format="json")
        order_id = create_response.data["id"]
        detail_response = self.client.get(f"/api/v1/orders/{order_id}/")

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data["order_id"], "ORDER-002")

    def test_get_order_ids_by_kid_id(self):
        response = self.client.get(f"/api/v1/kids/{self.kid.id}/order-ids/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"kid_id": self.kid.id, "order_ids": ["ORDER-001"]})

    def test_get_kid_ean_summary(self):
        self.kid.place = "A-01"
        self.kid.room = "ROOM-1"
        self.kid.furniture_type = "chair"
        self.kid.listing_status = "listed"
        self.kid.photo = ["https://cdn.example.com/photo-main.jpg"]
        self.kid.save(update_fields=["place", "room", "furniture_type", "listing_status", "photo"])

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
        self.assertEqual(response.data["kid_snapshot"]["listing_status"], "listed")
        self.assertEqual(response.data["kid_snapshot"]["main_ean"], "0000000000000")
        self.assertEqual(response.data["kid_snapshot"]["database_ean"], "0000000000000")
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
        self.assertTrue(response.data["inventory_flags"]["listed"])

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
            "date": "2026-04-07T11:00:00Z",
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
            date="2026-04-06T12:00:00Z",
        )

        response = self.client.get(f"/api/v1/inventory/rows/?kid_id={self.kid.id}&page_size=100")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertTrue(rows)
        self.assertTrue(all(row["kid_id"] == self.kid.id for row in rows))

    def test_kids_bulk_update_room_type_listing(self):
        second_kid = Kid.objects.create(kid_number="KID-SECOND-2")
        payload = {
            "updates": [
                {"kid_id": self.kid.id, "room": RU_LIVING_ROOM, "type": RU_SOFA, "listing_status": "listed"},
                {"kid_id": second_kid.id, "room": RU_KITCHEN, "type": RU_TABLE, "listing_status": "unlisted"},
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
        self.assertEqual(self.kid.listing_status, "listed")
        self.assertEqual(second_kid.listing_status, "unlisted")

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

    def test_inventory_rows_filter_by_room_type_listing_and_query(self):
        self.kid.listing_status = "listed"
        self.kid.room = RU_LIVING_ROOM
        self.kid.furniture_type = RU_SOFA
        self.kid.save(update_fields=["listing_status", "room", "furniture_type"])

        response = self.client.get(
            f"/api/v1/inventory/rows/?room={RU_LIVING_ROOM}&type={RU_SOFA}&listing=listed&q=13234455"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertTrue(rows)
        self.assertTrue(all(row["room"] == RU_LIVING_ROOM for row in rows))
        self.assertTrue(all(row["type"] == RU_SOFA for row in rows))
        self.assertTrue(all(row["listing_status"] == "listed" for row in rows))

    def test_inventory_rows_include_unified_product_attributes(self):
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
        self.kid.refresh_from_db()
        rows = response.data["results"]
        self.assertTrue(rows)
        row = rows[0]
        self.assertEqual(self.kid.furniture_type, "SOFA")
        self.assertEqual(row["company"], "Nordic House")
        self.assertEqual(row["color"], "Black")
        self.assertEqual(row["size"], "200x80")
        self.assertEqual(row["material"], "Wood")
        self.assertEqual(row["quantity"], 4)
        self.assertEqual(row["room"], "ROOM-X")
        self.assertEqual(row["type"], "SOFA")
        self.assertIsNone(row["price"])
        self.assertIsNone(row["price_currency"])

    @patch("database.views.build_inventory_rows")
    def test_inventory_rows_returns_structured_500_on_schema_error(self, mocked_build_inventory_rows):
        mocked_build_inventory_rows.side_effect = ProgrammingError("missing column database_kid.listing_status")

        response = self.client.get("/api/v1/inventory/rows/", HTTP_X_REQUEST_ID="req-test-500")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data["code"], "INVENTORY_ROWS_SCHEMA_ERROR")
        self.assertEqual(response.data["request_id"], "req-test-500")
        self.assertIn("hint", response.data["details"])
