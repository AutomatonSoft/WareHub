from rest_framework import status
from rest_framework.test import APITestCase
from django.db.utils import ProgrammingError
from unittest.mock import patch

from .models import Kid, Orders, ProductAttributes

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

    def test_create_kid(self):
        payload = {"kid_number": "900900"}
        response = self.client.post("/api/kids/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Kid.objects.filter(kid_number="900900").count(), 1)

    def test_create_kid_is_idempotent_by_kid_number(self):
        payload = {"kid_number": self.kid.kid_number, "place": "A1"}
        response = self.client.post("/api/kids/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Kid.objects.filter(kid_number=self.kid.kid_number).count(), 1)
        self.kid.refresh_from_db()
        self.assertEqual(self.kid.place, "A1")

    def test_list_and_retrieve_kid(self):
        list_response = self.client.get("/api/kids/")
        detail_response = self.client.get(f"/api/kids/{self.kid.id}/")

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data["kid_number"], self.kid.kid_number)

    def test_update_kid(self):
        response = self.client.patch(
            f"/api/kids/{self.kid.id}/", {"place": "stoyanka-3000"}, format="json"
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
        create_response = self.client.post("/api/orders/", payload, format="json")
        order_id = create_response.data["id"]
        detail_response = self.client.get(f"/api/orders/{order_id}/")

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data["order_id"], "ORDER-002")

    def test_get_order_ids_by_kid_id(self):
        response = self.client.get(f"/api/kids/{self.kid.id}/order-ids/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"kid_id": self.kid.id, "order_ids": ["ORDER-001"]})

    def test_get_kid_ean_summary(self):
        self.kid.place = "A-01"
        self.kid.room = "ROOM-1"
        self.kid.listing_status = "listed"
        self.kid.photo = ["https://cdn.example.com/photo-main.jpg"]
        self.kid.save(update_fields=["place", "room", "listing_status", "photo"])
        ProductAttributes.objects.update_or_create(
            kid=self.kid,
            defaults={"furniture_type": "chair"},
        )

        self.order.additional_items = [
            {"sku": "extra sku 4006381333931"},
            {"sku": "second sku 5901234123457"},
        ]
        self.order.save(update_fields=["additional_items"])

        response = self.client.get(f"/api/v1/kids/{self.kid.id}/ean-summary/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kid_id"], self.kid.id)
        self.assertEqual(response.data["kid_number"], self.kid.kid_number)
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
        response = self.client.post("/api/orders/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", response.data)

    def test_create_order_without_kid_fails(self):
        payload = {
            "order_id": "ORDER-004",
            "title": "No kid order",
            "status": "paid",
        }
        response = self.client.post("/api/orders/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("kid_number", response.data)

    def test_create_duplicate_order_for_same_kid_fails(self):
        payload = {
            "kid_number": self.kid.kid_number,
            "order_id": "ORDER-001",
            "title": "Updated title",
            "status": "paid",
        }
        response = self.client.post("/api/orders/", payload, format="json")

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
            f"/api/orders/{self.order.id}/", payload, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.title, "Updated title")
        self.assertEqual(self.order.status, "paid")

    def test_cannot_change_order_kid(self):
        second_kid = Kid.objects.create(kid_number="777777")
        response = self.client.patch(
            f"/api/orders/{self.order.id}/",
            {"kid_number": second_kid.kid_number},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("kid", response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.kid_id, self.kid.id)

    def test_user_can_only_read_kid_numbers_and_orders(self):
        self.set_session_role("user")

        kids_response = self.client.get("/api/kids/")
        orders_response = self.client.get("/api/orders/")

        self.assertEqual(kids_response.status_code, status.HTTP_200_OK)
        self.assertEqual(orders_response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(kids_response.data[0].keys()), {"kid_number"})
        self.assertEqual(set(orders_response.data[0].keys()), {"order_id", "kid_number"})

    def test_user_cannot_create_or_update(self):
        self.set_session_role("user")

        create_response = self.client.post(
            "/api/orders/",
            {
                "kid_number": self.kid.kid_number,
                "order_id": "ORDER-999",
                "title": "No access",
                "status": "paid",
            },
            format="json",
        )
        update_response = self.client.patch(
            f"/api/orders/{self.order.id}/",
            {"title": "No access"},
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_delete_order(self):
        response = self.client.delete(f"/api/orders/{self.order.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Orders.objects.filter(id=self.order.id).exists())

    def test_user_cannot_delete_order(self):
        self.set_session_role("user")
        response = self.client.delete(f"/api/orders/{self.order.id}/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Orders.objects.filter(id=self.order.id).exists())

    def test_inventory_rows_default_pagination(self):
        response = self.client.get("/api/inventory/rows/")

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

        response = self.client.get(f"/api/inventory/rows/?kid_id={self.kid.id}&page_size=100")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertTrue(rows)
        self.assertTrue(all(row["kid_id"] == self.kid.id for row in rows))

    def test_kids_bulk_update_room_type_listing(self):
        second_kid = Kid.objects.create(kid_number="KID-SECOND-2")
        payload = {
            "updates": [
                {"kid_id": self.kid.id, "room": "Гостиная", "type": "Диван", "listing_status": "listed"},
                {"kid_id": second_kid.id, "room": "Кухня", "type": "Стол", "listing_status": "unlisted"},
            ]
        }

        response = self.client.patch("/api/v1/kids/bulk-update/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated"], 2)
        self.kid.refresh_from_db()
        second_kid.refresh_from_db()
        self.assertEqual(self.kid.listing_status, "listed")
        self.assertEqual(second_kid.listing_status, "unlisted")
        first_attrs = ProductAttributes.objects.get(kid=self.kid)
        second_attrs = ProductAttributes.objects.get(kid=second_kid)
        self.assertEqual(first_attrs.room, "Гостиная")
        self.assertEqual(first_attrs.furniture_type, "Диван")
        self.assertEqual(second_attrs.room, "Кухня")
        self.assertEqual(second_attrs.furniture_type, "Стол")

    def test_kids_bulk_update_product_attributes(self):
        payload = {
            "updates": [
                {
                    "kid_id": self.kid.id,
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
        self.assertEqual(attrs.color, "White")
        self.assertEqual(attrs.size, "90x200")
        self.assertEqual(attrs.material, "Metal")
        self.assertEqual(str(attrs.price), "199.50")

    def test_inventory_rows_filter_by_room_type_listing_and_query(self):
        self.kid.listing_status = "listed"
        self.kid.save(update_fields=["listing_status"])
        ProductAttributes.objects.update_or_create(
            kid=self.kid,
            defaults={"room": "Гостиная", "furniture_type": "Диван"},
        )

        response = self.client.get("/api/v1/inventory/rows/?room=Гостиная&type=Диван&listing=listed&q=13234455")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertTrue(rows)
        self.assertTrue(all(row["room"] == "Гостиная" for row in rows))
        self.assertTrue(all(row["type"] == "Диван" for row in rows))
        self.assertTrue(all(row["listing_status"] == "listed" for row in rows))

    def test_inventory_rows_include_unified_product_attributes(self):
        ProductAttributes.objects.create(
            kid=self.kid,
            room="ROOM-X",
            furniture_type="SOFA",
            color="Black",
            size="200x80",
            material="Wood",
        )

        response = self.client.get(f"/api/v1/inventory/rows/?kid_id={self.kid.id}&page_size=100")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertTrue(rows)
        row = rows[0]
        self.assertEqual(row["color"], "Black")
        self.assertEqual(row["size"], "200x80")
        self.assertEqual(row["material"], "Wood")
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

