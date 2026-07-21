from decimal import Decimal
from datetime import timedelta
from unittest.mock import Mock
from xml.etree import ElementTree

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from .client import AfterbuyApiClient, AfterbuyApiError, AfterbuyCredentials, _decimal
from .contracts import AfterbuyLookupResult, AfterbuyOrder, AfterbuyOrderIdentity, AfterbuyOrderItem
from .memo_sync import (
    AFTERBUY_OPERATION_NOT_SELECTABLE,
    AfterbuyOrderMemoSyncService,
    _is_operation_not_selectable,
    _is_retryable,
    _memo_sync_error_message,
)
from .service import AfterbuyOrderLookupService
from .sync import AfterbuyKidSyncService
from database.models import Kid, OrderItem, Orders


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


UPDATE_RESPONSE = b"""<?xml version="1.0" encoding="utf-8"?>
<Afterbuy><CallStatus>Success</CallStatus><CallName>UpdateSoldItems</CallName><Result /></Afterbuy>"""

UPDATE_REJECTED_RESPONSE = b"""<?xml version="1.0" encoding="utf-8"?>
<Afterbuy><CallStatus>Error</CallStatus><ErrorList><Error><ErrorCode>33</ErrorCode><ErrorDescription>Not found</ErrorDescription></Error></ErrorList></Afterbuy>"""

UPDATE_SUCCESS_WITH_ERROR_CODE_RESPONSE = b"""<?xml version="1.0" encoding="utf-8"?>
<Afterbuy><CallStatus>Success</CallStatus><ErrorList><Error><ErrorCode>33</ErrorCode></Error></ErrorList></Afterbuy>"""


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

    def test_update_order_memo_builds_afterbuy_update_sold_items_request(self):
        response = Mock(content=UPDATE_RESPONSE)
        response.raise_for_status.return_value = None
        session = Mock()
        session.post.return_value = response
        client = AfterbuyApiClient(
            profile="JV",
            credentials=AfterbuyCredentials("partner", "account"),
            session=session,
        )

        client.update_order_memo(order_id="10001", memo="Updated memo")

        request_xml = ElementTree.fromstring(session.post.call_args.kwargs["data"])
        self.assertEqual("UpdateSoldItems", request_xml.findtext("AfterbuyGlobal/CallName"))
        self.assertEqual("10001", request_xml.findtext("Orders/Order/OrderID"))
        self.assertIsNone(request_xml.find("Orders/Order/AfterbuyOrderID"))
        self.assertIsNone(request_xml.find("Orders/Order/ItemID"))
        self.assertEqual("Updated memo", request_xml.findtext("Orders/Order/OrderMemo"))

    def test_update_order_memo_preserves_afterbuy_error_code(self):
        response = Mock(content=UPDATE_REJECTED_RESPONSE)
        response.raise_for_status.return_value = None
        session = Mock()
        session.post.return_value = response
        client = AfterbuyApiClient(
            profile="JV",
            credentials=AfterbuyCredentials("partner", "account"),
            session=session,
        )

        with self.assertRaises(AfterbuyApiError) as context:
            client.update_order_memo(order_id="10001", memo="Updated memo")

        self.assertEqual("33", context.exception.code)

    def test_update_order_memo_rejects_success_status_with_an_api_error_code(self):
        response = Mock(content=UPDATE_SUCCESS_WITH_ERROR_CODE_RESPONSE)
        response.raise_for_status.return_value = None
        session = Mock()
        session.post.return_value = response
        client = AfterbuyApiClient(
            profile="JV",
            credentials=AfterbuyCredentials("partner", "account"),
            session=session,
        )

        with self.assertRaises(AfterbuyApiError) as context:
            client.update_order_memo(order_id="10001", memo="Updated memo")

        self.assertEqual("33", context.exception.code)

    def test_update_order_memo_keeps_empty_memo_element(self):
        client = AfterbuyApiClient(
            profile="JV",
            credentials=AfterbuyCredentials("partner", "account"),
        )

        request_xml = ElementTree.fromstring(
            client._build_update_order_memo_request(order_id="10001", memo="")
        )

        self.assertIsNotNone(request_xml.find("Orders/Order/OrderMemo"))
        self.assertIsNone(request_xml.find("Orders/Order/ItemID"))

    def test_update_order_memo_escapes_xml_characters(self):
        client = AfterbuyApiClient(
            profile="JV",
            credentials=AfterbuyCredentials("partner", "account"),
        )

        request_xml = ElementTree.fromstring(
            client._build_update_order_memo_request(
                order_id="10001", memo="Assembly & delivery <to the door>"
            )
        )

        self.assertEqual("Assembly & delivery <to the door>", request_xml.findtext("Orders/Order/OrderMemo"))

    def test_update_order_memo_preserves_unicode_and_line_breaks(self):
        client = AfterbuyApiClient(
            profile="JV",
            credentials=AfterbuyCredentials("partner", "account"),
        )
        memo = "£90 bei Lieferung\nGrüße aus Köln & München"

        request_xml = ElementTree.fromstring(
            client._build_update_order_memo_request(order_id="775999778", memo=memo)
        )

        self.assertEqual(memo, request_xml.findtext("Orders/Order/OrderMemo"))

    def test_error_code_33_has_actionable_message(self):
        message = _memo_sync_error_message(AfterbuyApiError("not found", code="33"))

        self.assertIn("GetSoldItems resolved the internal OrderID", message)
        self.assertIn("ItemID was not sent", message)

    def test_error_code_33_is_not_retryable_and_has_a_specific_classification(self):
        error = AfterbuyApiError("not found", code="33")

        self.assertFalse(error.retryable)
        self.assertTrue(_is_operation_not_selectable(error))
        self.assertFalse(_is_retryable(error))
        self.assertEqual("afterbuy_operation_not_selectable", AFTERBUY_OPERATION_NOT_SELECTABLE)

    def test_only_transport_failures_are_retryable(self):
        self.assertTrue(_is_retryable(AfterbuyApiError("timeout", retryable=True)))
        self.assertFalse(_is_retryable(AfterbuyApiError("bad request")))


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

    def test_resolves_internal_order_id_from_marketplace_order_id(self):
        client = Mock(profile="JV")
        client.fetch_orders_by_kid.return_value = (
            AfterbuyOrder(
                profile="JV",
                order_id="123456789",
                order_id_alt="ALT-1",
                items=(AfterbuyOrderItem(platform_order_id="775999778"),),
            ),
        )
        service = AfterbuyOrderLookupService(client_factory=lambda _: client)

        identity = service.resolve_internal_order_id(
            kid_number="533223317",
            external_order_id="775999778",
            profiles=("JV",),
        )

        self.assertIsNotNone(identity)
        self.assertEqual("JV", identity.profile)
        self.assertEqual("123456789", identity.order_id)

    def test_identity_keeps_safe_context_for_error_code_33_diagnostics(self):
        client = Mock(profile="JV")
        client.fetch_orders_by_kid.return_value = (
            AfterbuyOrder(
                profile="JV",
                order_id="775999778",
                marketplace="jvmoebel_de",
                items=(
                    AfterbuyOrderItem(item_id="775999778", platform="eBay"),
                    AfterbuyOrderItem(item_id="776026344", platform="add"),
                ),
            ),
        )
        service = AfterbuyOrderLookupService(client_factory=lambda _: client)

        identity = service.resolve_internal_order_id(
            kid_number="544346381",
            external_order_id="775999778",
            profiles=("JV",),
        )

        self.assertIsNotNone(identity)
        assert identity is not None
        self.assertEqual("775999778", identity.order_id)
        self.assertEqual("775999778", identity.main_item_id)
        self.assertEqual("eBay", identity.marketplace)
        self.assertEqual("jvmoebel_de", identity.marketplace_account)

    def test_does_not_resolve_non_positive_internal_order_id(self):
        client = Mock(profile="JV")
        client.fetch_orders_by_kid.return_value = (
            AfterbuyOrder(profile="JV", order_id="0", order_id_alt="market-1"),
        )
        service = AfterbuyOrderLookupService(client_factory=lambda _: client)

        self.assertIsNone(
            service.resolve_internal_order_id(
                kid_number="533223317",
                external_order_id="market-1",
                profiles=("JV",),
            )
        )


class AfterbuyOrderMemoSyncServiceTests(TestCase):
    def test_syncs_local_memo_to_afterbuy_and_marks_order_synced(self):
        kid = Kid.objects.create(kid_number="533223317")
        order = Orders.objects.create(
            kid=kid,
            order_id="10001",
            title="Test order",
            memo="Updated memo",
            status="no_paid",
            afterbuy_profile="JV",
        )
        OrderItem.objects.create(order=order, afterbuy_item_id="10002")
        lookup_service = Mock()
        lookup_service.resolve_internal_order_id.return_value = AfterbuyOrderIdentity(
            profile="JV", order_id="123456789"
        )
        service = AfterbuyOrderMemoSyncService(lookup_service=lookup_service)

        result = service.sync_order(order)

        lookup_service.update_order_memo.assert_called_once_with(
            profile="JV",
            order_id="123456789",
            memo="Updated memo",
        )
        self.assertEqual("synced", result.memo_sync_status)
        self.assertIsNone(result.memo_sync_error)
        self.assertIsNotNone(result.memo_last_synced_at)

    def test_error_code_33_marks_failed_without_a_second_update_attempt(self):
        kid = Kid.objects.create(kid_number="544346381")
        order = Orders.objects.create(
            kid=kid,
            order_id="775999778",
            title="Test order",
            memo="Updated memo",
            status="no_paid",
            afterbuy_profile="JV",
        )
        lookup_service = Mock()
        lookup_service.resolve_internal_order_id.return_value = AfterbuyOrderIdentity(
            profile="JV",
            order_id="775999778",
            main_item_id="775999778",
            marketplace="eBay",
            marketplace_account="jvmoebel_de",
        )
        lookup_service.update_order_memo.side_effect = AfterbuyApiError(
            "Afterbuy rejected memo update.",
            code="33",
            error_description="Es konnten keine Vorgänge identifiziert werden",
        )

        result = AfterbuyOrderMemoSyncService(lookup_service=lookup_service).sync_order(order)

        result.refresh_from_db()
        lookup_service.update_order_memo.assert_called_once_with(
            profile="JV",
            order_id="775999778",
            memo="Updated memo",
        )
        self.assertEqual("failed", result.memo_sync_status)
        self.assertEqual(AFTERBUY_OPERATION_NOT_SELECTABLE, result.memo_sync_error_type)
        self.assertIn("GetSoldItems resolved the internal OrderID", result.memo_sync_error)
        self.assertIsNone(result.memo_last_synced_at)

    def test_get_sold_items_sync_preserves_every_local_failed_memo_field(self):
        kid = Kid.objects.create(kid_number="544346381")
        local_sync_at = timezone.now() - timedelta(minutes=5)
        order = Orders.objects.create(
            kid=kid,
            order_id="775999778",
            title="Local title",
            memo="Local memo must survive",
            status="no_paid",
            afterbuy_profile="JV",
            memo_sync_status="failed",
            memo_sync_error="Safe local error",
            memo_sync_error_type=AFTERBUY_OPERATION_NOT_SELECTABLE,
            memo_last_synced_at=local_sync_at,
        )
        lookup_result = AfterbuyLookupResult(
            profile="JV",
            orders=(
                AfterbuyOrder(
                    profile="JV",
                    order_id="775999778",
                    memo="Remote memo must not overwrite pending local state",
                ),
            ),
        )

        AfterbuyKidSyncService().sync_lookup_result(kid=kid, lookup_result=lookup_result)

        order.refresh_from_db()
        self.assertEqual("Local memo must survive", order.memo)
        self.assertEqual("failed", order.memo_sync_status)
        self.assertEqual("Safe local error", order.memo_sync_error)
        self.assertEqual(AFTERBUY_OPERATION_NOT_SELECTABLE, order.memo_sync_error_type)
        self.assertEqual(local_sync_at, order.memo_last_synced_at)
