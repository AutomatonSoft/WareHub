from django.test import TestCase
from django.utils import timezone
from unittest.mock import patch

from .service import (
    filter_items,
    parse_order_detail_fields,
    parse_auktionsliste_items,
    parse_sold_items,
    search_items_auktionsliste,
)
from .api_utils import parse_order_date


SAMPLE_XML = """<?xml version="1.0" encoding="utf-8"?>
<Afterbuy>
  <CallStatus>Success</CallStatus>
  <CallName>GetSoldItems</CallName>
  <Result>
    <Orders>
      <Order>
        <OrderID>1001</OrderID>
        <EbayAccount>xlmoebel_de</EbayAccount>
        <OrderDate>01.03.2024 14:29:50</OrderDate>
        <BuyerInfo>
          <BillingAddress>
            <AfterbuyUserID>434955602</AfterbuyUserID>
            <AfterbuyUserIDAlt>10000</AfterbuyUserIDAlt>
            <UserIDPlattform>KID-434955602</UserIDPlattform>
            <FirstName>Max</FirstName>
            <LastName>Mustermann</LastName>
            <Company></Company>
            <Mail>max@example.com</Mail>
          </BillingAddress>
        </BuyerInfo>
        <SoldItems>
          <SoldItem>
            <ItemID>5001</ItemID>
            <ItemTitle>Amazon Gutschein 10 EUR</ItemTitle>
            <ItemQuantity>1</ItemQuantity>
            <ItemPrice>10,00</ItemPrice>
          </SoldItem>
        </SoldItems>
      </Order>
      <Order>
        <OrderID>1002</OrderID>
        <EbayAccount>jvstore_de</EbayAccount>
        <OrderDate>02.03.2024 10:00:00</OrderDate>
        <BuyerInfo>
          <BillingAddress>
            <AfterbuyUserID>999999</AfterbuyUserID>
            <AfterbuyUserIDAlt>20000</AfterbuyUserIDAlt>
            <UserIDPlattform>KID-999999</UserIDPlattform>
            <FirstName>Anna</FirstName>
            <LastName>Beispiel</LastName>
            <Company>Beispiel GmbH</Company>
            <Mail>anna@example.com</Mail>
          </BillingAddress>
        </BuyerInfo>
        <SoldItems>
          <SoldItem>
            <ItemID>5002</ItemID>
            <ItemTitle>eBay Artikel Test</ItemTitle>
            <ItemQuantity>2</ItemQuantity>
            <ItemPrice>5,00</ItemPrice>
          </SoldItem>
        </SoldItems>
      </Order>
    </Orders>
  </Result>
</Afterbuy>
"""


class AfterbuySearchTests(TestCase):
    def test_parse_order_date_returns_aware_datetime(self):
        parsed = parse_order_date("13.09.2025 23:20:05")
        self.assertIsNotNone(parsed)
        self.assertTrue(timezone.is_aware(parsed))

    def test_parse_items(self):
        items = parse_sold_items(SAMPLE_XML)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["order_id"], "1001")
        self.assertEqual(items[0]["item_title"], "Amazon Gutschein 10 EUR")

    def test_filter_by_ebay(self):
        items = parse_sold_items(SAMPLE_XML)
        found = filter_items(items, ebay="xlmoebel")
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["order_id"], "1001")

    def test_filter_by_kundenname(self):
        items = parse_sold_items(SAMPLE_XML)
        found = filter_items(items, kundenname="anna")
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["order_id"], "1002")

    def test_filter_by_kundennummer(self):
        items = parse_sold_items(SAMPLE_XML)
        found = filter_items(items, kundennummer="434955602")
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["order_id"], "1001")

    def test_parse_auktionsliste_items(self):
        html = """
        <html><body>
        <tr class="seller-overview-table-frow" data-row-item-id="691274710" data-art="Otto">
            <td>
                <div><b>1x Test Produkt</b></div>
                SKU (Art.-Nr. 1):&nbsp;173936612
                Best.-Nr. (Art.-Nr. 2).:&nbsp;cbn4w3v78j
                <td class="EING">06.04.2026 18:11:10</td>
                <td data-identification="auctiongroup">691274708</td>
                <a href="http://feedback.ebay.de/ws/eBayISAPI.dll?LeaveFeedback2&amp;useridto=testbuyer">B</a>
            </td>
        </tr>
        </body></html>
        """
        items = parse_auktionsliste_items(html)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["order_id"], "691274710")
        self.assertEqual(items[0]["platform"], "Otto")
        self.assertEqual(items[0]["title"], "1x Test Produkt")
        self.assertEqual(items[0]["buyer"], "testbuyer")

    @patch("orders_pars.service.profile_has_login_credentials", return_value=True)
    @patch("orders_pars.service.fetch_auktionsliste_html")
    def test_relogin_retry_when_kundennummer_not_found(self, mock_fetch, _mock_profile):
        html_empty = "<html><body><p>Kein Datensatz vorhanden</p></body></html>"
        html_result = """
        <html><body>
        <tr class="seller-overview-table-frow" data-row-item-id="7001" data-art="ebay">
            <td><div><b>Retry Product</b></div></td>
        </tr>
        </body></html>
        """
        mock_fetch.side_effect = [html_empty, html_result]

        items = search_items_auktionsliste(
            kundennummer="556262593",
            include_order_details=False,
        )

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["order_id"], "7001")
        self.assertEqual(mock_fetch.call_count, 2)
        self.assertEqual(mock_fetch.call_args_list[0].kwargs.get("login_profile"), "JV")
        self.assertEqual(mock_fetch.call_args_list[1].kwargs.get("login_profile"), "XL")
        self.assertTrue(mock_fetch.call_args_list[1].kwargs.get("force_relogin"))

    def test_parse_order_detail_fields(self):
        detail_html = """
        <html><body>
            <table>
                <tr><td>SKU</td><td>ABC-123</td></tr>
                <tr><td>Verkaufsdatum</td><td>07.04.2026 16:45:00</td></tr>
                <tr><td>Zahlungssumme</td><td>149,99 EUR</td></tr>
                <tr><td>Rechnungssumme</td><td>159,99 EUR</td></tr>
            </table>
        </body></html>
        """
        fields = parse_order_detail_fields(detail_html)
        self.assertEqual(fields["sku"], "ABC-123")
        self.assertEqual(fields["verkaufsdatum"], "07.04.2026 16:45:00")
        self.assertEqual(fields["zahlungssumme"], "149,99 EUR")
        self.assertEqual(fields["rechnungssumme"], "159,99 EUR")

    def test_parse_order_detail_fields_by_item_id(self):
        detail_html = """
        <html><body>
            <div class="panel panel-default">
                <div class="panel-heading">
                    <input type="checkbox" name="id_fsp" value="1001" />
                    <div class="pull-right">Verkaufsdatum <strong>01.01.2026 10:00:00</strong></div>
                </div>
                <div class="panel-body">
                    <div>SKU: SKU-ONE</div>
                </div>
            </div>
            <div class="panel panel-default">
                <div class="panel-heading">
                    <input type="checkbox" name="id_fsp" value="1002" />
                    <div class="pull-right">Verkaufsdatum <strong>02.01.2026 11:30:00</strong></div>
                </div>
                <div class="panel-body">
                    <div>Bestellnr.: ONLY-ALT</div>
                </div>
            </div>
            <table>
                <tr>
                    <td>Zahlungssumme</td>
                    <td>
                        <input type="text" name="zahlung" value="2.136,75" />
                        <span>EUR</span>
                    </td>
                </tr>
                <tr>
                    <td>Rechnungssumme</td>
                    <td class="red">2.136,75 EUR</td>
                </tr>
            </table>
            <textarea name="Memo">Memo line 1
Memo line 2</textarea>
        </body></html>
        """
        fields_1 = parse_order_detail_fields(detail_html, item_id="1001")
        self.assertEqual(fields_1["sku"], "SKU-ONE")
        self.assertEqual(fields_1["verkaufsdatum"], "01.01.2026 10:00:00")
        self.assertEqual(fields_1["zahlungssumme"], "2.136,75 EUR")
        self.assertEqual(fields_1["rechnungssumme"], "2.136,75 EUR")
        self.assertEqual(fields_1["memo"], "Memo line 1\nMemo line 2")

        fields_2 = parse_order_detail_fields(detail_html, item_id="1002")
        self.assertEqual(fields_2["sku"], "")
        self.assertEqual(fields_2["verkaufsdatum"], "02.01.2026 11:30:00")
        self.assertEqual(fields_2["zahlungssumme"], "2.136,75 EUR")
        self.assertEqual(fields_2["rechnungssumme"], "2.136,75 EUR")
        self.assertEqual(fields_2["memo"], "Memo line 1\nMemo line 2")
