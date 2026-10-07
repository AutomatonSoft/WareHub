from django.test import TestCase

from database.inventory_service import build_inventory_rows
from database.models import Ean, EanStatus, Kid, ProductAttributes


class BuildInventoryRowsTests(TestCase):
    def test_negative_place_is_archived_without_persisted_flag(self):
        kid = Kid.objects.create(kid_number=["123456789"], place="-35", archived=False)
        row = next(row for row in build_inventory_rows() if row["kid_id"] == kid.pk)
        self.assertTrue(row["archived"])
        kid.refresh_from_db()
        self.assertFalse(kid.archived)

    def test_uses_joined_one_to_one_relations_for_kid_metadata(self):
        kid = Kid.objects.create(kid_number=["123456789"])
        Ean.objects.create(kid=kid, main_ean_jv="4012345678901", main_ean_xl="4012345678902", jv="JVM4012345678901")
        EanStatus.objects.create(ean=kid, jv=True)
        ProductAttributes.objects.create(kid=kid, quantity=2, price="19.99")

        with self.assertNumQueries(2):
            rows = build_inventory_rows()

        self.assertEqual(rows[0]["main_ean_jv"], "4012345678901")
        self.assertEqual(rows[0]["main_ean_xl"], "4012345678902")
        self.assertTrue(rows[0]["ean_status"]["jv"])
        self.assertEqual(rows[0]["quantity"], 2)
