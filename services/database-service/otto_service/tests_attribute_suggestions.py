import json
from unittest.mock import Mock, patch

import requests
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from .attribute_suggestions import OttoAttributeSuggestionError, product_facts, suggest_otto_attributes
from .attribute_suggestion_views import OttoAttributeSuggestionsAPIView


class OttoAttributeSuggestionTests(SimpleTestCase):
    def test_taxonomy_evidence_allowed_values_and_numbers(self):
        response = Mock()
        response.json.return_value = {'output_text': json.dumps({'suggestions': [
            {'id': 'color', 'value': 'gold', 'evidence': 'Gold'},
            {'id': 'height', 'value': '65', 'evidence': '65 cm'},
            {'id': 'width', 'value': '99', 'evidence': '65 cm'},
            {'id': 'material', 'value': 'Holz', 'evidence': 'Holz'},
            {'id': 'fake', 'value': 'Gold', 'evidence': 'Gold'},
            {'id': 'color', 'value': 'Silber', 'evidence': 'Gold'},
        ]})}
        taxonomy = [
            {'attributeId': 'color', 'name': 'Farbe', 'allowedValues': ['Gold', 'Weiß']},
            {'attributeId': 'height', 'name': 'Höhe', 'type': 'INTEGER', 'unit': 'cm'},
            {'attributeId': 'width', 'name': 'Breite', 'type': 'INTEGER'},
            {'attributeId': 'material', 'name': 'Material'},
        ]
        with patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'}), patch('otto_service.attribute_suggestions.requests.post', return_value=response) as post:
            result = suggest_otto_attributes(category_id='chair', product={'title': 'Sessel Gold', 'height': '65 cm', 'password': 'secret'}, attributes=taxonomy)
        self.assertEqual([item['value'] for item in result['suggestions']], ['Gold', '65'])
        self.assertEqual(result['considered_attribute_count'], 4)
        payload = post.call_args.kwargs['json']
        self.assertFalse(payload['store'])
        self.assertTrue(payload['text']['format']['strict'])
        self.assertNotIn('secret', json.dumps(payload))

    def test_invalid_allowed_value_and_numeric_type_are_omitted(self):
        response = Mock()
        response.json.return_value = {'output_text': json.dumps({'suggestions': [
            {'id': 'color', 'value': 'Gold', 'evidence': 'Gold'},
            {'id': 'height', 'value': '65 cm', 'evidence': '65 cm'},
        ]})}
        with patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'}), patch('otto_service.attribute_suggestions.requests.post', return_value=response):
            result = suggest_otto_attributes(category_id='chair', product={'title': 'Gold 65 cm'}, attributes=[
                {'attributeId': 'color', 'name': 'Farbe', 'allowedValues': ['Weiß']},
                {'attributeId': 'height', 'name': 'Höhe', 'type': 'INTEGER'},
            ])
        self.assertEqual(result['suggestions'], [])

    def test_missing_configuration_and_upstream_failure(self):
        with patch.dict('os.environ', {'OPENAI_API_KEY': ''}), patch('otto_service.attribute_suggestions.requests.post') as post:
            with self.assertRaises(OttoAttributeSuggestionError):
                suggest_otto_attributes(category_id='chair', product={'title': 'Chair'}, attributes=[])
            post.assert_not_called()
        with patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'}), patch('otto_service.attribute_suggestions.requests.post', side_effect=requests.Timeout):
            with self.assertRaises(OttoAttributeSuggestionError):
                suggest_otto_attributes(category_id='chair', product={'title': 'Chair'}, attributes=[{'attributeId': 'color', 'name': 'Farbe'}])

    def test_nested_product_facts_exclude_configuration(self):
        self.assertEqual(product_facts({'source': {'rawPayload': {'row': {'Farbe': 'Gold', 'api_key': 'secret'}}}, 'profile': 'jv'}), {'source': {'rawPayload': {'row': {'Farbe': 'Gold'}}}})

    def request(self, data, role='admin'):
        request = APIRequestFactory().post('/api/v1/otto/attributes/suggestions/', data, format='json')
        request.session = {'role': role}
        return OttoAttributeSuggestionsAPIView.as_view()(request)

    def test_endpoint_fetches_server_taxonomy_and_does_not_publish(self):
        with patch('otto_service.attribute_suggestion_views.OttoCategoryCache') as cache, patch('otto_service.attribute_suggestion_views.suggest_otto_attributes', return_value={'suggestions': []}) as suggest:
            cache.return_value.attributes.return_value = [{'attributeId': 'color', 'name': 'Farbe'}]
            response = self.request({'categoryId': 'chair', 'product': {'title': 'Sessel'}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(suggest.call_args.kwargs['attributes'], [{'attributeId': 'color', 'name': 'Farbe'}])

    def test_endpoint_refreshes_missing_taxonomy(self):
        with patch('otto_service.attribute_suggestion_views.OttoCategoryCache') as cache, patch('otto_service.attribute_suggestion_views.OttoExternalProductsClient') as external, patch('otto_service.attribute_suggestion_views.suggest_otto_attributes', return_value={'suggestions': []}):
            cache.return_value.attributes.return_value = None
            external.return_value.fetch_attributes.return_value = {'attributes': [{'attributeId': 'color', 'name': 'Farbe'}]}
            response = self.request({'categoryId': 'chair', 'product': {'title': 'Sessel'}})
        self.assertEqual(response.status_code, 200)
        external.return_value.fetch_attributes.assert_called_once_with(category_id='chair')
        cache.return_value.store_attributes.assert_called_once_with('chair', [{'attributeId': 'color', 'name': 'Farbe'}])

    def test_invalid_ai_response_and_endpoint_failure_are_safe(self):
        response = Mock()
        response.json.return_value = {'output_text': '{}'}
        with patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'}), patch('otto_service.attribute_suggestions.requests.post', return_value=response):
            with self.assertRaises(OttoAttributeSuggestionError):
                suggest_otto_attributes(category_id='chair', product={'title': 'Chair'}, attributes=[{'attributeId': 'color', 'name': 'Farbe'}])
        with patch('otto_service.attribute_suggestion_views.OttoCategoryCache') as cache:
            cache.return_value.attributes.side_effect = RuntimeError('private connection details')
            result = self.request({'categoryId': 'chair', 'product': {'title': 'Sessel'}})
        self.assertEqual(result.status_code, 503)
        self.assertNotIn('private', str(result.data))

    def test_endpoint_rejects_missing_category_oversize_and_anonymous(self):
        with patch('otto_service.attribute_suggestion_views.OttoCategoryCache') as cache:
            self.assertEqual(self.request({'product': {'title': 'Sessel'}}).status_code, 400)
            self.assertEqual(self.request({'categoryId': 'chair', 'product': {'title': 'x' * 60001}}).status_code, 400)
            self.assertIn(self.request({'categoryId': 'chair', 'product': {'title': 'Sessel'}}, role='').status_code, [401, 403])
            cache.assert_not_called()
