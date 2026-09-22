from django.test import TestCase

# Create your tests here.

from django.test import SimpleTestCase

from jv_services.view_helpers import normalize_jv_description_html


class JVDescriptionHtmlNormalizationTest(SimpleTestCase):
    def test_regular_text_h3_with_inline_font_size_becomes_paragraph(self):
        html = '<h3 style=""><span style="font-size: 16px;"><b>Farbe:</b> Weiß</span></h3>'

        self.assertEqual(
            normalize_jv_description_html(html),
            '<p style=""><span style="font-size: 16px;"><b>Farbe:</b> Weiß</span></p>',
        )

    def test_regular_heading_without_inline_font_size_is_preserved(self):
        html = '<h3>Product details</h3>'

        self.assertEqual(normalize_jv_description_html(html), html)
