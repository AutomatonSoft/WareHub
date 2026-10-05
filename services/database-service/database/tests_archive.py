from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from database.views_archive import KidArchiveAPIView
from database.views import InventoryRowsAPIView


class ArchiveTests(SimpleTestCase):
    def test_auth_and_payload_validation(self):
        request = APIRequestFactory().post("/", {"kid_number": "123", "archived": False}, format="json")
        request.session = {}
        self.assertIn(KidArchiveAPIView.as_view()(request).status_code, (401, 403))
        request = APIRequestFactory().post("/", {"kid_number": "123", "kid_id": -1, "archived": False}, format="json")
        request.session = {"role": "admin"}
        self.assertEqual(KidArchiveAPIView.as_view()(request).status_code, 400)

    def test_archive_restore_and_active_guard(self):
        for archived, active, expected in ((True, False, 200), (False, True, 200), (True, True, 409)):
            with self.subTest(archived=archived, active=active):
                kid = SimpleNamespace(pk=7, archived=not archived, save=Mock())
                flags = SimpleNamespace(jv=active)
                field = SimpleNamespace(name="jv", get_internal_type=lambda: "BooleanField")
                request = APIRequestFactory().post("/", {"kid_number": "123", "kid_id": 7, "archived": archived}, format="json")
                request.session = {"role": "admin"}
                with patch("database.views_archive._find_kid_by_number", return_value=kid), patch("database.views_archive.transaction.atomic", return_value=nullcontext()), patch("database.views_archive.Kid.objects.select_for_update") as locked, patch("database.views_archive.EanStatus.objects.filter") as statuses, patch("database.views_archive.EanStatus._meta.fields", [field]), patch("database.views_archive.record_inventory_change") as audit:
                    locked.return_value.get.return_value = kid
                    statuses.return_value.first.return_value = flags
                    response = KidArchiveAPIView.as_view()(request)
                self.assertEqual(response.status_code, expected)
                self.assertEqual(kid.save.called, expected == 200)
                self.assertEqual(audit.called, expected == 200)
                if expected == 200:
                    self.assertEqual(kid.archived, archived)
                self.assertEqual(flags.jv, active)

    def test_inventory_archive_filter_and_validation(self):
        for value, expected in (("true", [2]), ("false", [1]), (None, [1, 2])):
            request = APIRequestFactory().get("/", {"archived": value} if value else {})
            request.session = {"role": "admin"}
            rows = [{"kid_id": 1, "archived": False}, {"kid_id": 2, "archived": True}]
            with patch("database.views.build_inventory_rows", return_value=rows), patch("database.views._sort_inventory_rows_by_place", side_effect=lambda rows, **kwargs: rows):
                response = InventoryRowsAPIView.as_view()(request)
            self.assertEqual(response.status_code, 200)
            self.assertEqual([row["kid_id"] for row in response.data["results"]], expected)
        request = APIRequestFactory().get("/", {"archived": "invalid"})
        request.session = {"role": "admin"}
        with patch("database.views.build_inventory_rows", return_value=[]):
            self.assertEqual(InventoryRowsAPIView.as_view()(request).status_code, 400)
