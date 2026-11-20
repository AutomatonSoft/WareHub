import uuid
from contextlib import nullcontext
from unittest.mock import MagicMock, patch
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.db import connection, connections
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APITestCase

from database.ean_ownership import EanOwnershipConflict, ean_fields, serialize_ean_ownership
from database.models import Ean, EanStatus, EANPool, Kid
from database.serializers import EanPatchSerializer
from database.marketplace_ean_mapping_service import MarketplaceEanMappingError, confirm_marketplace_ean_mapping


@override_settings(DEBUG=False)
class EanOwnershipTests(APITestCase):
    ean = '4069943985122'

    def setUp(self):
        self.first = Kid.objects.create(kid_number=['559680098'], place='150')
        self.second = Kid.objects.create(kid_number=['563069789'], place='1223')
        self.owner = Ean.objects.create(kid=self.first, otto_xl=self.ean)
        self.other = Ean.objects.create(kid=self.second)
        session = self.client.session
        session['role'] = 'admin'
        session.save()

    def test_every_column_rejects_another_kid(self):
        for field in ean_fields(Ean):
            with self.subTest(field=field), self.assertRaises(EanOwnershipConflict):
                setattr(self.other, field, self.ean)
                self.other.save(update_fields=[field])
        self.other.refresh_from_db()
        self.assertTrue(all(getattr(self.other, field) is None for field in ean_fields(Ean)))

    def test_same_kid_can_use_its_ean_on_all_destinations(self):
        for field in ean_fields(Ean):
            setattr(self.owner, field, self.ean)
        self.owner.save()
        self.owner.refresh_from_db()
        self.assertTrue(all(getattr(self.owner, field) == self.ean for field in ean_fields(Ean)))

    def test_archived_owner_still_blocks_reuse(self):
        self.first.archived = True
        self.first.save(update_fields=['archived'])
        self.other.hood_jv = self.ean
        with self.assertRaises(EanOwnershipConflict):
            self.other.save()

    def test_create_and_partial_serializer_update_are_protected(self):
        third = Kid.objects.create(kid_number=['123'], place='123')
        with self.assertRaises(EanOwnershipConflict):
            Ean.objects.create(kid=third, temu=self.ean)
        serializer = EanPatchSerializer(self.other, data={'otto_jv': self.ean}, partial=True)
        serializer.is_valid(raise_exception=True)
        with self.assertRaises(EanOwnershipConflict):
            serializer.save()

    def test_api_conflict_returns_owner_and_rolls_back_other_edits(self):
        EanStatus.objects.create(ean=self.second, otto_jv=True)
        response = self.client.patch(f'/api/v1/kids/{self.second.pk}/composite-update/', {
            'kid': {'commentary': 'must roll back'}, 'ean': {'otto_jv': self.ean},
        }, format='json')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'ean_owned_by_another_kid')
        self.assertEqual(response.data['owner_kid_id'], self.first.pk)
        self.second.refresh_from_db()
        self.assertNotEqual(self.second.commentary, 'must roll back')
        self.assertTrue(EanStatus.objects.get(ean=self.second).otto_jv)

    def test_existing_conflict_can_be_left_unchanged_or_cleared_without_reassigning_it(self):
        Ean.objects.filter(pk=self.other.pk).update(otto_jv=self.ean)
        self.other.refresh_from_db()
        self.other.save(update_fields=['otto_jv'])
        self.other.otto_jv = None
        self.other.save(update_fields=['otto_jv'])
        self.assertIsNone(Ean.objects.get(pk=self.other.pk).otto_jv)

    def test_placeholders_are_not_product_ownership(self):
        for value in ['0000000000000', 'B_WARE', None, '']:
            for row in [self.owner, self.other]:
                row.otto_jv = value
                row.save(update_fields=['otto_jv'])

    def test_whitespace_cannot_bypass_ownership(self):
        self.other.hood_jv = f' {self.ean} '
        with self.assertRaises(EanOwnershipConflict):
            self.other.save(update_fields=['hood_jv'])

    def test_pool_skips_assigned_eans_even_if_marked_free(self):
        EANPool.objects.create(ean=self.ean, status='free')
        free = EANPool.objects.create(ean='4071489369823', status='free')
        for path in ['take-next-free', 'claim-for-job']:
            with self.subTest(path=path):
                free.status = 'free'
                free.save(update_fields=['status'])
                response = self.client.post(f'/api/v1/ean-pool/{path}/', {'job_id': str(uuid.uuid4())}, format='json')
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data['ean'], free.ean)

    def test_manual_pool_reservation_cannot_reassign_an_owned_ean(self):
        EANPool.objects.create(ean=self.ean, status='free')
        response = self.client.post('/api/v1/ean-pool/reserve/', {'ean': self.ean}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(EANPool.objects.get(ean=self.ean).status, 'free')

    def test_mapping_confirmation_rejects_another_owner_and_keeps_status_unchanged(self):
        lookup = MagicMock()
        lookup.filter.return_value = Kid.objects.filter(pk=self.second.pk)
        with patch.object(Kid.objects, 'select_for_update', return_value=lookup):
            with self.assertRaises(EanOwnershipConflict):
                confirm_marketplace_ean_mapping(kid_number='563069789', kid_id=self.second.pk, marketplace='hood', account='jv', ean=self.ean)
        self.other.refresh_from_db()
        self.assertIsNone(self.other.hood_jv)
        self.assertFalse(EanStatus.objects.filter(ean=self.second).exists())

    def test_mapping_confirmation_can_use_the_same_ean_in_another_account_for_its_owner(self):
        lookup = MagicMock()
        lookup.filter.return_value = Kid.objects.filter(pk=self.first.pk)
        with patch.object(Kid.objects, 'select_for_update', return_value=lookup):
            result = confirm_marketplace_ean_mapping(kid_number='559680098', kid_id=self.first.pk, marketplace='hood', account='jv', ean=self.ean)
        self.assertEqual(result['ean'], self.ean)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.hood_jv, self.ean)

    def test_old_conflicting_reservation_is_blocked_without_allocating_a_replacement(self):
        Ean.objects.filter(pk=self.other.pk).update(reserved_jv=self.ean)
        EANPool.objects.create(ean=self.ean, status='reserved')
        lookup = MagicMock()
        lookup.filter.return_value = Kid.objects.filter(pk=self.second.pk)
        with patch.object(Kid.objects, 'select_for_update', return_value=lookup):
            response = self.client.post('/api/v1/ean-pool/claim-for-job/', {
                'job_id': str(uuid.uuid4()), 'kid_number': '563069789', 'reservation_family': 'jv',
            }, format='json')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(EANPool.objects.count(), 1)

    def test_claim_is_idempotent_for_the_same_kid(self):
        EANPool.objects.create(ean=self.ean, status='used')
        self.owner.reserved_jv = self.ean
        self.owner.save(update_fields=['reserved_jv'])
        lookup = MagicMock()
        lookup.filter.return_value = Kid.objects.filter(pk=self.first.pk)
        with patch.object(Kid.objects, 'select_for_update', return_value=lookup):
            for _ in range(2):
                response = self.client.post('/api/v1/ean-pool/claim-for-job/', {
                    'job_id': str(uuid.uuid4()), 'kid_number': '559680098', 'reservation_family': 'jv',
                }, format='json')
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data['ean'], self.ean)

    def test_postgres_locks_are_transaction_scoped_and_in_stable_order(self):
        connection = MagicMock(vendor='postgresql')
        with patch('database.ean_ownership.connections', {'test': connection}), patch('database.ean_ownership.transaction.atomic', return_value=nullcontext()):
            with serialize_ean_ownership(['B', 'A', 'A'], using='test'):
                pass
            first = list(connection.cursor.return_value.__enter__.return_value.execute.call_args_list)
            connection.reset_mock()
            with serialize_ean_ownership(['A', 'B'], using='test'):
                pass
            self.assertEqual(first, connection.cursor.return_value.__enter__.return_value.execute.call_args_list)
            self.assertEqual(len(first), 2)
            self.assertTrue(all(call.args[0] == 'SELECT pg_advisory_xact_lock(%s)' for call in first))

    def test_duplicate_number_requires_selection_for_reserve_and_mark_used(self):
        self.second.kid_number = self.first.kid_number
        self.second.save(update_fields=['kid_number'])
        free = EANPool.objects.create(ean='4071489369823', status='free')
        lookup = MagicMock()
        lookup.filter.return_value = Kid.objects.filter(pk__in=[self.first.pk, self.second.pk])
        payload = {'job_id': str(uuid.uuid4()), 'kid_number': '559680098', 'reservation_family': 'jv'}
        claim = '/api/v1/ean-pool/claim-for-job/'
        mark_used = '/api/v1/ean-pool/mark-job-used/'
        with patch.object(Kid.objects, 'select_for_update', return_value=lookup):
            for path in [claim, mark_used]:
                self.assertEqual(self.client.post(path, payload, format='json').status_code, 409)
            self.assertEqual(self.client.post(claim, {**payload, 'kid_id': 999999}, format='json').status_code, 409)
            free.refresh_from_db()
            self.assertEqual(free.status, 'free')
            selected = {**payload, 'kid_id': self.second.pk}
            response = self.client.post(claim, selected, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['ean'], free.ean)
            response = self.client.post(mark_used, selected, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['status'], 'used')
        self.owner.refresh_from_db()
        self.other.refresh_from_db()
        self.assertIsNone(self.owner.reserved_jv)
        self.assertEqual(self.other.reserved_jv, free.ean)

    def test_mapping_rejects_ambiguous_number_for_all_marketplaces(self):
        lookup = MagicMock()
        lookup.filter.return_value = Kid.objects.filter(pk__in=[self.first.pk, self.second.pk])
        with patch.object(Kid.objects, 'select_for_update', return_value=lookup):
            for marketplace in ['otto', 'xljv', 'hood', 'kaufland', 'ebay']:
                with self.subTest(marketplace=marketplace), self.assertRaisesRegex(MarketplaceEanMappingError, 'specify|kid_id'):
                    confirm_marketplace_ean_mapping(kid_number='559680098', marketplace=marketplace, account='xl', ean='4071489369823')


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL advisory locks')
class EanOwnershipConcurrencyTests(TransactionTestCase):
    def test_only_one_kid_can_claim_the_same_ean_concurrently(self):
        first = Ean.objects.create(kid=Kid.objects.create(kid_number=['1'], place='1'))
        second = Ean.objects.create(kid=Kid.objects.create(kid_number=['2'], place='2'))
        barrier = Barrier(2)

        def assign(pk):
            try:
                row = Ean.objects.get(pk=pk)
                row.otto_jv = '4069943985122'
                barrier.wait(timeout=10)
                row.save(update_fields=['otto_jv'])
                return 'saved'
            except EanOwnershipConflict:
                return 'conflict'
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            self.assertEqual(sorted(executor.map(assign, [first.pk, second.pk])), ['conflict', 'saved'])
        self.assertEqual(Ean.objects.filter(otto_jv='4069943985122').count(), 1)
