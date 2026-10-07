from copy import deepcopy
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from .attribute_defaults import with_create_attribute_defaults
from .views import OttoCategoryAttributesAPIView


class OttoAttributeDefaultsTests(SimpleTestCase):
    def test_account_templates_and_aliases_preserve_taxonomy(self):
        names = [
            'Art Herstellung', 'Geschlecht', 'Hinweis Maßangaben',
            'Informationen zur Datennutzung (nach EU Data Act)', 'Marke laut BattVO',
            'Markeninformation', 'Pflegehinweise', 'Hinweis Lieferumfang', 'WEE-Reg. Nr.',
            'Wissenswert', 'Warnhinweise', 'Farbhinweise', 'Materialhinweis', 'Other',
        ]
        taxonomy = [{'attributeId': str(index), 'name': name} for index, name in enumerate(names)]
        original = deepcopy(taxonomy)
        for profile, brand, display, number in [('jv', 'JVMOEBEL', 'JVmoebel®', '46974041'), ('xl', 'XLMOEBEL', 'XLmoebel', '80120806')]:
            with self.subTest(profile=profile):
                items = with_create_attribute_defaults(taxonomy, profile)
                values = {item['name']: item['defaultValue'] for item in items if 'defaultValue' in item}
                self.assertEqual(len(values), 13)
                self.assertEqual(values['Marke laut BattVO'], brand)
                self.assertEqual(values['WEE-Reg. Nr.'], number)
                self.assertTrue(values['Markeninformation'].startswith(display))
                self.assertTrue(values['Materialhinweis'].startswith(display))
                self.assertIn('Dekoration', values['Hinweis Lieferumfang'])
                self.assertIn('Produktbeschreibung', values['Hinweis Lieferumfang'])
                self.assertEqual([item['attributeId'] for item in items], [item['attributeId'] for item in taxonomy])
        self.assertEqual(taxonomy, original)

    def test_only_supported_allowed_values_and_explicit_profiles(self):
        taxonomy = [
            {'attributeId': 'gender', 'name': 'Geschlecht', 'allowedValues': ['unisex']},
            {'attributeId': 'care', 'name': 'Pflegehinweise', 'allowedValues': ['Other']},
        ]
        items = with_create_attribute_defaults(taxonomy, 'jv')
        self.assertEqual(items[0]['defaultValue'], 'unisex')
        self.assertNotIn('defaultValue', items[1])
        self.assertIs(with_create_attribute_defaults(taxonomy, ''), taxonomy)

    def test_api_does_not_pollute_cache_or_other_callers(self):
        taxonomy = [{'attributeId': 'brand', 'name': 'Marke laut BattVO'}]
        for profile, expected in [('jv', 'JVMOEBEL'), ('xl', 'XLMOEBEL'), ('', None)]:
            request = APIRequestFactory().post('/api/v1/otto/attributes/', {'categoryId': 'chair', 'profile': profile}, format='json')
            request.session = {'role': 'admin'}
            with patch('otto_service.views.OttoCategoryCache') as cache:
                cache.return_value.attributes.return_value = taxonomy
                response = OttoCategoryAttributesAPIView.as_view()(request)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['attributes'][0].get('defaultValue'), expected)
        self.assertNotIn('defaultValue', taxonomy[0])

    def test_api_rejects_unknown_profile(self):
        request = APIRequestFactory().post('/api/v1/otto/attributes/', {'categoryId': 'chair', 'profile': 'dep'}, format='json')
        request.session = {'role': 'admin'}
        with patch('otto_service.views.OttoCategoryCache') as cache:
            response = OttoCategoryAttributesAPIView.as_view()(request)
        self.assertEqual(response.status_code, 400)
        cache.assert_not_called()
