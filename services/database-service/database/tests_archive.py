from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, TestCase
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

    def test_archive_restore_preserves_marketplace_statuses(self):
        for archived, active, expected in ((True, False, 200), (False, True, 200), (True, True, 200)):
            with self.subTest(archived=archived, active=active):
                kid = SimpleNamespace(pk=7, archived=not archived, place="-3", save=Mock())
                flags = SimpleNamespace(jv=active)
                request = APIRequestFactory().post("/", {"kid_number": "123", "kid_id": 7, "archived": archived, "place": "12"}, format="json")
                request.session = {"role": "admin"}
                with patch("database.views_archive._find_kid_by_number", return_value=kid), patch("database.views_archive.transaction.atomic", return_value=nullcontext()), patch("database.views_archive.Kid.objects.select_for_update") as locked, patch("database.models.EanStatus.objects") as statuses, patch("database.views_archive.record_inventory_change") as audit:
                    locked.return_value.get.return_value = kid
                    response = KidArchiveAPIView.as_view()(request)
                self.assertEqual(response.status_code, expected)
                self.assertEqual(kid.save.called, expected == 200)
                self.assertEqual(audit.called, expected == 200)
                if expected == 200:
                    self.assertEqual(kid.archived, archived)
                    self.assertEqual(kid.place, "-3" if archived else "12")
                    if not archived:
                        self.assertIn({"field": "place", "before": "-3", "after": "12"}, audit.call_args.kwargs["changes"])
                self.assertEqual(flags.jv, active)
                statuses.assert_not_called()
                self.assertEqual(statuses.mock_calls, [])

    def test_inventory_archive_filter_and_validation(self):
        for value, expected in (("true", [2, 3]), ("false", [1, 6]), (None, [1, 2, 3, 4, 5, 6])):
            request = APIRequestFactory().get("/", {"archived": value} if value else {})
            request.session = {"role": "admin"}
            rows = [
                {"kid_id": 1, "archived": False, "place": "3"},
                {"kid_id": 2, "archived": True, "place": "5"},
                {"kid_id": 3, "archived": False, "place": "-7"},
                {"kid_id": 4, "archived": False, "place": "0"},
                {"kid_id": 5, "archived": False, "place": ""},
                {"kid_id": 6, "archived": False, "place": "9993A"},
            ]
            with patch("database.views.build_inventory_rows", return_value=rows), patch("database.views._sort_inventory_rows_by_place", side_effect=lambda rows, **kwargs: rows):
                response = InventoryRowsAPIView.as_view()(request)
            self.assertEqual(response.status_code, 200)
            self.assertEqual([row["kid_id"] for row in response.data["results"]], expected)
        request = APIRequestFactory().get("/", {"archived": "invalid"})
        request.session = {"role": "admin"}
        with patch("database.views.build_inventory_rows", return_value=[]):
            self.assertEqual(InventoryRowsAPIView.as_view()(request).status_code, 400)

    def test_restore_requires_positive_place(self):
        for place in (None, "", "0", "-12", "abc", "1.5"):
            with self.subTest(place=place):
                payload = {"kid_number": "123", "archived": False}
                if place is not None:
                    payload["place"] = place
                request = APIRequestFactory().post("/", payload, format="json")
                request.session = {"role": "admin"}
                with patch("database.views_archive._find_kid_by_number") as find:
                    response = KidArchiveAPIView.as_view()(request)
                self.assertEqual(response.status_code, 400)
                self.assertIn("place", response.data)
                find.assert_not_called()

    def test_restore_occupied_place_returns_conflict(self):
        from django.db import IntegrityError
        kid = SimpleNamespace(pk=7, archived=True, place="-3", save=Mock(side_effect=IntegrityError()))
        request = APIRequestFactory().post("/", {"kid_number": "123", "archived": False, "place": "12"}, format="json")
        request.session = {"role": "admin"}
        with patch("database.views_archive._find_kid_by_number", return_value=kid), patch("database.views_archive.transaction.atomic", return_value=nullcontext()), patch("database.views_archive.Kid.objects.select_for_update") as locked, patch("database.views_archive.record_inventory_change") as audit:
            locked.return_value.get.return_value = kid
            response = KidArchiveAPIView.as_view()(request)
        self.assertEqual(response.status_code, 409)
        audit.assert_not_called()


class ArchivePersistenceTests(TestCase):
    def test_restore_updates_place_and_audits_previous_place(self):
        from database.models import Kid, InventoryChangeLog
        kid = Kid.objects.create(kid_number=["123"], place="-35", archived=False)
        request = APIRequestFactory().post("/", {"kid_number": "123", "kid_id": kid.pk, "archived": False, "place": "0012"}, format="json")
        request.session = {"role": "admin"}
        with patch("database.views_archive._find_kid_by_number", return_value=kid):
            response = KidArchiveAPIView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        kid.refresh_from_db()
        self.assertEqual(kid.place, "12")
        self.assertFalse(kid.archived)
        self.assertIn({"field": "place", "before": "-35", "after": "12"}, InventoryChangeLog.objects.get(kid=kid).changes)

    def test_occupied_place_rolls_back_restore(self):
        from database.models import Kid, InventoryChangeLog
        kid = Kid.objects.create(kid_number=["123"], place="-35", archived=True)
        Kid.objects.create(kid_number=["456"], place="12")
        request = APIRequestFactory().post("/", {"kid_number": "123", "kid_id": kid.pk, "archived": False, "place": "12"}, format="json")
        request.session = {"role": "admin"}
        with patch("database.views_archive._find_kid_by_number", return_value=kid):
            response = KidArchiveAPIView.as_view()(request)
        self.assertEqual(response.status_code, 409)
        kid.refresh_from_db()
        self.assertEqual(kid.place, "-35")
        self.assertTrue(kid.archived)
        self.assertFalse(InventoryChangeLog.objects.filter(kid=kid).exists())
