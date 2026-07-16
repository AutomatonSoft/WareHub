from decimal import Decimal
from unittest.mock import Mock
from xml.etree import ElementTree

from django.test import SimpleTestCase

from .client import AfterbuyApiClient, AfterbuyCredentials, _decimal
from .contracts import AfterbuyOrder
from .service import AfterbuyOrderLookupService


API_RESPONSE = b"""<?xml version=\"1.0\" encoding=\"utf-8\"?>
<Result><Orders><Order>
  <BuyerInfo><BillingAddress><AfterbuyUserID>533223317</AfterbuyUserID><AfterbuyUserIDAlt>22685</AfterbuyUserIDAlt><UserIDPlattform>KID-533223317</UserIDPlattform><FirstName>Test</FirstName><LastName>User</LastName><Mail>test@example.invalid</Mail><PostalCode>12345</PostalCode><City>Leipzig</City></BillingAddress>
  <ShippingAddress><FirstName>Test</FirstName><LastName>User</LastName><PostalCode>12345</PostalCode><City>Leipzig</City></ShippingAddress></BuyerInfo>
  <OrderID>10001</OrderID><OrderIDAlt>ALT-1</OrderIDAlt><OrderDate>2026-07-16</OrderDate><InvoiceNumber>INV-1</InvoiceNumber><Memo>Handle with care</Memo><InvoiceAmount>19.95</InvoiceAmount>
  <PaymentInfo><PaymentID>INVOICE</PaymentID><PaymentMethod>PayPal</PaymentMethod><PaymentFunction>TRANSFER</PaymentFunction><AlreadyPaid>19.95</AlreadyPaid><FullAmount>19.95</FullAmount><PaymentDate>2026-07-16</PaymentDate></PaymentInfo>
  <ShippingInfo><ShippingMethod>DHL</ShippingMethod><ShippingTaxRate>19.00</ShippingTaxRate><DeliveryDate>2026-07-17</DeliveryDate><ShippingCost>4.99</ShippingCost><ShippingTotalCost>4.99</ShippingTotalCost></ShippingInfo>
  <OrderOriginalCurrency><InvoiceAmount>19.95</InvoiceAmount><PayedAmount>19.95</PayedAmount></OrderOriginalCurrency>
  <SoldItems><SoldItem><ItemID>item-1</ItemID><Anr>SKU-1</Anr><ItemTitle>Example product</ItemTitle><ItemQuantity>2</ItemQuantity><ItemPrice>9.98</ItemPrice><ItemOriginalCurrency><ItemPrice>9.98</ItemPrice><ItemPriceCode>EUR</ItemPriceCode><ItemShipping>4.99</ItemShipping></ItemOriginalCurrency><ItemPlatformName>SHOP</ItemPlatformName><PlatformSpecificOrderId>market-1</PlatformSpecificOrderId></SoldItem></SoldItems>
</Order></Orders></Result>"""


class AfterbuyApiClientTests(SimpleTestCase):
    def test_decimal_rejects_non_finite_afterbuy_values(self):
        self.assertIsNone(_decimal("NaN"))
        self.assertIsNone(_decimal("Infinity"))

    def test_fetch_by_kid_builds_hidden_items_filter_and_maps_response(self):
        response = Mock(content=API_RESPONSE)
        response.raise_for_status.return_value = None
        session = Mock()
        session.post.return_value = response
        client = AfterbuyApiClient(
            profile="JV",
            credentials=AfterbuyCredentials("partner", "account"),
            session=session,
        )

        orders = client.fetch_orders_by_kid("533223317")

        request_xml = ElementTree.fromstring(session.post.call_args.kwargs["data"])
        self.assertEqual("GetSoldItems", request_xml.findtext("AfterbuyGlobal/CallName"))
        self.assertEqual("1", request_xml.findtext("ReturnHiddenItems"))
        self.assertEqual("AfterbuyUserID", request_xml.findtext("DataFilter/Filter/FilterName"))
        self.assertEqual("533223317", request_xml.findtext("DataFilter/Filter/FilterValues/FilterValue"))
        self.assertEqual(1, len(orders))
        self.assertEqual("10001", orders[0].order_id)
        self.assertEqual(Decimal("19.95"), orders[0].payment.paid_amount)
        self.assertEqual("INVOICE", orders[0].payment.payment_id)
        self.assertEqual("DHL", orders[0].shipping.method)
        self.assertEqual(Decimal("19.00"), orders[0].shipping.tax_rate)
        self.assertEqual(Decimal("19.95"), orders[0].invoice_amount)
        self.assertEqual("533223317", orders[0].billing_address.afterbuy_user_id)
        self.assertEqual("test@example.invalid", orders[0].billing_address.email)
        self.assertEqual(2, orders[0].items[0].quantity)
        self.assertEqual("EUR", orders[0].items[0].currency)


class AfterbuyOrderLookupServiceTests(SimpleTestCase):
    def test_uses_next_profile_only_when_previous_has_no_orders(self):
        jv_client = Mock(profile="JV")
        jv_client.fetch_orders_by_kid.return_value = ()
        xl_order = AfterbuyOrder(profile="XL", order_id="20002")
        xl_client = Mock(profile="XL")
        xl_client.fetch_orders_by_kid.return_value = (xl_order,)
        clients = {"JV": jv_client, "XL": xl_client}
        service = AfterbuyOrderLookupService(client_factory=clients.__getitem__)

        result = service.find_by_kid("533223317", profiles=("JV", "XL"))

        self.assertIsNotNone(result)
        self.assertEqual("XL", result.profile)
        self.assertEqual((xl_order,), result.orders)
        jv_client.fetch_orders_by_kid.assert_called_once_with("533223317")
        xl_client.fetch_orders_by_kid.assert_called_once_with("533223317")
