from datetime import timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from kaufland.models import KauflandPublication
from otto_service.models import OttoPublication


@override_settings(DEBUG=False, ORCHESTRATOR_SERVICE_AUTH_TOKEN='review-test-token', ORCHESTRATOR_SERVICE_ALLOWED_HOSTS=['testserver'])
class PublicationStatesTests(APITestCase):
    url = '/api/v1/marketplace/publication-states/'

    def post(self, entries):
        return self.client.post(self.url, {'entries': entries}, format='json', HTTP_X_WAREHUB_SERVICE_TOKEN='review-test-token')

    def test_anonymous_requests_are_denied(self):
        response = self.client.post(self.url, {'entries': []}, format='json')
        self.assertIn(response.status_code, [401, 403])

    def test_batch_is_bounded_and_destinations_are_validated(self):
        entry = {'key': 'a', 'marketplace': 'otto', 'account': 'jv', 'ean': '123'}
        self.assertEqual(self.post([entry] * 101).status_code, 400)
        self.assertEqual(self.post([{**entry, 'account': 'other'}]).status_code, 400)
        self.assertEqual(self.post([{**entry, 'marketplace': 'hood'}]).status_code, 400)

    def test_accounts_and_marketplaces_do_not_share_state(self):
        now = timezone.now()
        OttoPublication.objects.create(profile='jv', sku='123', ean='123', task_id='otto-task', state='rejected', online=False, errors=[{'title': 'Invalid color'}], submitted_at=now)
        OttoPublication.objects.create(profile='xl', sku='123', ean='123', state='online', online=True, submitted_at=now)
        KauflandPublication.objects.create(controller='jv', ean='123', online=False, errors=[{'title': 'Image missing'}], submitted_at=now)
        entries = [{'key': f'{market}:{account}', 'marketplace': market, 'account': account, 'ean': '123'} for market in ['otto', 'kaufland'] for account in ['jv', 'xl']]
        response = self.post(entries)
        self.assertEqual(response.status_code, 200)
        items = {item['key']: item for item in response.data['items']}
        self.assertEqual(set(items), {'otto:jv', 'otto:xl', 'kaufland:jv'})
        self.assertEqual(items['otto:jv']['state'], 'rejected')
        self.assertEqual(items['otto:jv']['task_id'], 'otto-task')
        self.assertTrue(items['otto:xl']['online'])
        self.assertEqual(items['kaufland:jv']['state'], 'pending')
        self.assertEqual(items['kaufland:jv']['submitted_at_unix_ms'], int(now.timestamp() * 1000))

    def test_latest_submission_wins_when_an_ean_has_several_skus(self):
        now = timezone.now()
        OttoPublication.objects.create(profile='jv', sku='old', ean='123', state='online', online=True, submitted_at=now - timedelta(days=1))
        OttoPublication.objects.create(profile='jv', sku='new', ean='123', state='pending', online=False, submitted_at=now)
        response = self.post([{'key': 'current', 'marketplace': 'otto', 'account': 'jv', 'ean': '123'}])
        self.assertEqual(response.data['items'][0]['state'], 'pending')
