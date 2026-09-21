import hashlib
import json
import os
import re
from decimal import Decimal, InvalidOperation

from django.core import signing
from django.core.cache import cache
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission
from database.idempotency import build_request_hash, claim_or_replay, derive_idem_key, finalize_error, finalize_success

from .client import EbayApiError, EbayNotificationClient, EbayOAuthClient, EbayTaxonomyClient
from .credentials import EbayCredentialError, store_refresh_token
from .listing_operations import execute_listing_operation, index_legacy_listing_page, reconcile_legacy_listing


_OAUTH_STATE_SALT = "ebay-oauth-state"
_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT_ENV = "EBAY_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT"
_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN_ENV = "EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN"
_VERIFICATION_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{32,80}$")
_EBAY_SELLER_ACCOUNTS = frozenset({"jv", "xl", "dep"})


class EbayOAuthAuthorizationUrlAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        account = _account(request.query_params.get("account"))
        if account is None:
            return Response({"code": "ebay_oauth_invalid_account", "detail": "account must be jv, xl, or dep."}, status=400)
        try:
            state = signing.dumps({"account": account}, salt=_OAUTH_STATE_SALT, compress=True)
            return Response({"account": account, "authorization_url": EbayOAuthClient().authorization_url(state=state)})
        except EbayApiError as error:
            return _oauth_error_response(error)


class EbayOAuthCodeExchangeAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        return _exchange_code_response(code=request.data.get("code"), state=request.data.get("state"))


class EbayOAuthCallbackAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return _exchange_code_response(code=request.query_params.get("code"), state=request.query_params.get("state"))


class EbayMarketplaceAccountDeletionAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        challenge_code = str(request.query_params.get("challenge_code") or "").strip()
        if not challenge_code or len(challenge_code) > 2048:
            return Response({"code": "ebay_notification_invalid_challenge", "detail": "challenge_code is required."}, status=400)
        endpoint, verification_token = _marketplace_account_deletion_config()
        if endpoint is None or verification_token is None:
            return Response({"code": "ebay_notification_not_configured", "detail": "eBay notification endpoint is not configured."}, status=503)
        challenge_response = hashlib.sha256(f"{challenge_code}{verification_token}{endpoint}".encode("utf-8")).hexdigest()
        return Response({"challengeResponse": challenge_response})

    def post(self, request):
        signature_header = str(request.headers.get("X-EBAY-SIGNATURE") or "").strip()
        if not signature_header:
            return Response(status=412)
        try:
            is_valid = EbayNotificationClient().verify_marketplace_account_deletion_notification(
                raw_payload=request.body,
                signature_header=signature_header,
            )
        except EbayApiError:
            return Response(status=503)
        if not is_valid:
            return Response(status=412)
        try:
            payload = json.loads(request.body)
        except (TypeError, ValueError):
            return Response(status=400)
        topic = payload.get("metadata", {}).get("topic") if isinstance(payload, dict) else None
        if topic != "MARKETPLACE_ACCOUNT_DELETION":
            return Response(status=400)
        return Response(status=204)


class EbaySellerSetupAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        account = _account(request.query_params.get("account"))
        marketplace_id = str(request.query_params.get("marketplace_id") or "").strip()
        if account is None or not marketplace_id or len(marketplace_id) > 64:
            return Response(
                {"code": "ebay_seller_setup_invalid_request", "detail": "account (jv, xl, or dep) and marketplace_id are required."},
                status=400,
            )
        try:
            return Response(EbayOAuthClient().seller_setup(account=account, marketplace_id=marketplace_id))
        except EbayApiError as error:
            return _seller_setup_error_response(error, account=account, marketplace_id=marketplace_id)


class EbayInventoryLocationAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        account = _account(payload.get("account"))
        merchant_location_key = str(payload.get("merchant_location_key") or "").strip()
        name = str(payload.get("name") or "").strip()
        address = _inventory_location_address(payload)
        if account is None or not merchant_location_key or len(merchant_location_key) > 50 or not name or address is None:
            return Response(
                {
                    "code": "ebay_inventory_location_invalid_request",
                    "detail": "account, merchant_location_key, name, and address are required. Address needs country plus postal_code, or city and state_or_province.",
                },
                status=400,
            )
        try:
            EbayOAuthClient().create_inventory_location(
                account=account,
                merchant_location_key=merchant_location_key,
                name=name,
                address=address,
            )
        except EbayApiError as error:
            return _inventory_location_error_response(error, account=account, merchant_location_key=merchant_location_key)
        return Response(
            {"account": account, "merchant_location_key": merchant_location_key, "status": "created"},
            status=201,
        )


class EbaySellingPolicyManagementAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        account = _account(payload.get("account"))
        if account is None:
            return Response(
                {"code": "ebay_selling_policy_management_invalid_request", "detail": "account must be jv, xl, or dep."},
                status=400,
            )
        try:
            EbayOAuthClient().opt_in_to_selling_policy_management(account=account)
        except EbayApiError as error:
            return _selling_policy_management_error_response(error, account=account)
        return Response({"account": account, "program_type": "SELLING_POLICY_MANAGEMENT", "status": "opted_in"}, status=201)


class EbaySellerPolicyAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        account = _account(payload.get("account"))
        policy_type = str(payload.get("policy_type") or "").strip().lower()
        policy = payload.get("policy")
        if account is None or policy_type not in {"fulfillment", "payment", "return"} or not isinstance(policy, dict):
            return Response(
                {
                    "code": "ebay_seller_policy_invalid_request",
                    "detail": "account, policy_type (fulfillment, payment, or return), and policy object are required.",
                },
                status=400,
            )
        if not str(policy.get("name") or "").strip() or not str(policy.get("marketplaceId") or "").strip() or not isinstance(policy.get("categoryTypes"), list):
            return Response(
                {
                    "code": "ebay_seller_policy_invalid_request",
                    "detail": "policy.name, policy.marketplaceId, and policy.categoryTypes are required.",
                },
                status=400,
            )
        try:
            result = EbayOAuthClient().create_seller_policy(account=account, policy_type=policy_type, policy=policy)
        except EbayApiError as error:
            return _seller_policy_error_response(error, account=account, policy_type=policy_type)
        return Response({"account": account, "policy_type": policy_type, "status": "created", "data": result}, status=201)


class EbayShippingServicesAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        account = _account(request.query_params.get("account"))
        marketplace_id = str(request.query_params.get("marketplace_id") or "").strip()
        if account is None or not marketplace_id:
            return Response(
                {"code": "ebay_shipping_services_invalid_request", "detail": "account (jv, xl, or dep) and marketplace_id are required."},
                status=400,
            )
        try:
            return Response(EbayOAuthClient().shipping_services(account=account, marketplace_id=marketplace_id))
        except EbayApiError as error:
            return _shipping_services_error_response(error, account=account, marketplace_id=marketplace_id)


class EbayListingAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, item_id: str):
        account = _account(request.query_params.get("account"))
        marketplace_id = str(request.query_params.get("marketplace_id") or "EBAY_DE").strip()
        normalized_item_id = str(item_id or "").strip()
        if account is None or not marketplace_id or not normalized_item_id.isdigit() or len(normalized_item_id) > 19:
            return Response(
                {"code": "ebay_listing_invalid_request", "detail": "account, marketplace_id, and a numeric item_id up to 19 digits are required."},
                status=400,
            )
        try:
            listing = EbayOAuthClient().listing(account=account, item_id=normalized_item_id, marketplace_id=marketplace_id)
        except EbayApiError as error:
            return _listing_error_response(error, account=account, item_id=normalized_item_id, marketplace_id=marketplace_id)
        return Response({"account": account, "listing": listing})


class EbayActiveListingsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        account = _account(request.query_params.get("account"))
        marketplace_id = str(request.query_params.get("marketplace_id") or "EBAY_DE").strip()
        page = _bounded_positive_int(request.query_params.get("page"), default=1, maximum=10_000)
        limit = _bounded_positive_int(request.query_params.get("limit"), default=100, maximum=100)
        if account is None or not marketplace_id or page is None or limit is None:
            return Response(
                {"code": "ebay_active_listings_invalid_request", "detail": "account, marketplace_id, page (1-10000), and limit (1-100) are required."},
                status=400,
            )
        try:
            listings = EbayOAuthClient().active_listings(account=account, marketplace_id=marketplace_id, page=page, limit=limit)
        except EbayApiError as error:
            return _active_listings_error_response(error, account=account, marketplace_id=marketplace_id)
        return Response({"account": account, "active_listings": listings})


class EbayLegacyListingReconciliationAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        account = _account(payload.get("account"))
        marketplace_id = str(payload.get("marketplace_id") or "EBAY_DE").strip()
        source_ean = str(payload.get("source_ean") or "").strip()
        page = _bounded_positive_int(payload.get("page"), default=1, maximum=10_000)
        limit = _bounded_positive_int(payload.get("limit"), default=100, maximum=100)
        if account is None or marketplace_id != "EBAY_DE" or not source_ean or len(source_ean) > 64 or page is None or limit is None:
            return Response(
                {"code": "ebay_legacy_listing_reconciliation_invalid_request", "detail": "Valid account, EBAY_DE marketplace_id, source_ean, page, and limit are required."},
                status=400,
            )
        try:
            result = reconcile_legacy_listing(
                account=account,
                marketplace_id=marketplace_id,
                source_ean=source_ean,
                page=page,
                limit=limit,
            )
        except EbayApiError as error:
            return _listing_error_response(error, account=account, item_id="", marketplace_id=marketplace_id)
        return Response(result)


class EbayLegacyListingIndexAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        account = _account(payload.get("account"))
        marketplace_id = str(payload.get("marketplace_id") or "EBAY_DE").strip()
        page = _bounded_positive_int(payload.get("page"), default=1, maximum=10_000)
        limit = _bounded_positive_int(payload.get("limit"), default=100, maximum=100)
        if account is None or marketplace_id != "EBAY_DE" or page is None or limit is None:
            return Response(
                {"code": "ebay_legacy_listing_index_invalid_request", "detail": "Valid account, EBAY_DE marketplace_id, page (1-10000), and limit (1-100) are required."},
                status=400,
            )
        try:
            result = index_legacy_listing_page(
                account=account,
                marketplace_id=marketplace_id,
                page=page,
                limit=limit,
            )
        except EbayApiError as error:
            return _listing_error_response(error, account=account, item_id="", marketplace_id=marketplace_id)
        return Response(result)


class EbayInventoryItemAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        account = _account(request.query_params.get("account"))
        sku = str(request.query_params.get("sku") or "").strip()
        marketplace_id = str(request.query_params.get("marketplace_id") or "EBAY_DE").strip()
        limit = _bounded_positive_int(request.query_params.get("limit"), default=100, maximum=100)
        offset = _nonnegative_int(request.query_params.get("offset") or 0)
        if account is None or marketplace_id != "EBAY_DE" or limit is None or offset is None or len(sku) > 50:
            return Response(
                {"code": "ebay_inventory_item_invalid_request", "detail": "Valid account, EBAY_DE marketplace_id, sku (up to 50 characters), limit, and offset are required."},
                status=400,
            )
        try:
            client = EbayOAuthClient()
            result = (
                client.inventory_item(account=account, sku=sku)
                if sku
                else client.inventory_items(account=account, limit=limit, offset=offset)
            )
        except EbayApiError as error:
            return _inventory_item_error_response(error, account=account, sku=sku)
        return Response({"account": account, "marketplace_id": marketplace_id, "inventory": result})

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        account = _account(payload.get("account"))
        sku = str(payload.get("sku") or "").strip()
        marketplace_id = str(payload.get("marketplace_id") or "EBAY_DE").strip()
        item = payload.get("item")
        if account is None or not sku or len(sku) > 50 or not marketplace_id or not isinstance(item, dict):
            return Response(
                {"code": "ebay_inventory_item_invalid_request", "detail": "account, sku (up to 50 characters), marketplace_id, and item object are required."},
                status=400,
            )
        try:
            EbayOAuthClient().create_or_replace_inventory_item(
                account=account,
                sku=sku,
                item=item,
                marketplace_id=marketplace_id,
            )
        except EbayApiError as error:
            return _inventory_item_error_response(error, account=account, sku=sku)
        return Response({"account": account, "sku": sku, "marketplace_id": marketplace_id, "status": "created_or_replaced"})


class EbayOfferAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        account = _account(payload.get("account"))
        offer = payload.get("offer")
        legacy_item = payload.get("legacy_item")
        if account is None or not isinstance(offer, dict):
            return Response(
                {"code": "ebay_offer_invalid_request", "detail": "account and offer object are required."},
                status=400,
            )
        try:
            result = EbayOAuthClient().create_offer(account=account, offer=offer)
        except EbayApiError as error:
            return _offer_error_response(error, account=account)
        return Response({"account": account, "status": "created", "data": result}, status=201)


class EbayListingOperationAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        account = _account(payload.get("account"))
        marketplace_id = str(payload.get("marketplace_id") or "EBAY_DE").strip()
        operation = str(payload.get("operation") or "").strip().lower()
        listing_mode = str(payload.get("listing_mode") or "").strip().lower()
        sku = str(payload.get("sku") or "").strip()
        item_id = str(payload.get("item_id") or "").strip()
        source_ean = str(payload.get("source_ean") or "").strip()
        variation_sku = str(payload.get("variation_sku") or "").strip()
        inventory_item = payload.get("inventory_item")
        offer = payload.get("offer")
        quantity = _nonnegative_int(payload.get("quantity"))
        price = _price(payload.get("price"))
        currency = str(payload.get("currency") or "EUR").strip().upper()

        if (
            account is None
            or marketplace_id != "EBAY_DE"
            or operation not in {"fetch", "publish", "update", "unpublish", "relist"}
            or listing_mode not in {"inventory", "legacy"}
            or len(sku) > 50
            or len(variation_sku) > 50
            or (item_id and (not item_id.isdigit() or len(item_id) > 19))
            or (quantity is None and payload.get("quantity") is not None)
            or (price is None and payload.get("price") is not None)
            or len(currency) != 3
            or not currency.isalpha()
            or (inventory_item is not None and not isinstance(inventory_item, dict))
            or (offer is not None and not isinstance(offer, dict))
            or (legacy_item is not None and not isinstance(legacy_item, dict))
        ):
            return Response(
                {
                    "code": "ebay_listing_operation_invalid_request",
                    "detail": "Valid account, EBAY_DE marketplace_id, operation, listing_mode, and operation payload are required.",
                },
                status=400,
            )
        if operation == "fetch":
            try:
                result = execute_listing_operation(
                    account=account,
                    marketplace_id=marketplace_id,
                    operation=operation,
                    listing_mode=listing_mode,
                    sku=sku,
                    item_id=item_id,
                    source_ean=source_ean,
                    variation_sku=variation_sku,
                )
            except EbayApiError as error:
                return _listing_operation_error_response(
                    error,
                    account=account,
                    marketplace_id=marketplace_id,
                    operation=operation,
                    listing_mode=listing_mode,
                    sku=sku,
                    item_id=item_id,
                )
            return Response(result)
        request_hash = build_request_hash(
            method=request.method,
            path=request.path,
            query=dict(request.query_params),
            body=payload,
        )
        idempotency_state, idempotency_record = claim_or_replay(
            scope="ebay.listing_operation",
            idem_key=derive_idem_key(request, request_hash),
            request_hash=request_hash,
        )
        if idempotency_state == "replay":
            return Response(idempotency_record.response_payload, status=idempotency_record.status_code or 200)
        if idempotency_state == "processing":
            return Response(
                {"code": "ebay_listing_operation_in_progress", "detail": "Request with same idempotency key is in progress."},
                status=409,
            )
        if idempotency_state == "conflict":
            return Response(
                {"code": "ebay_listing_operation_idempotency_key_conflict", "detail": "Idempotency key was reused with a different payload."},
                status=409,
            )
        if idempotency_state != "claimed" or idempotency_record is None:
            return Response(
                {"code": "ebay_listing_operation_idempotency_unavailable", "detail": "Could not claim idempotency key."},
                status=503,
            )
        try:
            result = execute_listing_operation(
                account=account,
                marketplace_id=marketplace_id,
                operation=operation,
                listing_mode=listing_mode,
                sku=sku,
                item_id=item_id,
                source_ean=source_ean,
                variation_sku=variation_sku,
                inventory_item=inventory_item,
                offer=offer,
                quantity=quantity,
                price=price,
                currency=currency,
                legacy_item=legacy_item,
            )
        except EbayApiError as error:
            response = _listing_operation_error_response(
                error,
                account=account,
                marketplace_id=marketplace_id,
                operation=operation,
                listing_mode=listing_mode,
                sku=sku,
                item_id=item_id,
            )
            finalize_error(
                idempotency_record,
                status_code=response.status_code,
                payload=response.data,
                error_code=str(response.data.get("code") or "ebay_listing_operation_request_failed"),
            )
            return response
        finalize_success(idempotency_record, status_code=200, payload=result)
        return Response(result)


class EbayCategorySuggestionsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        query = str(request.query_params.get("q") or "").strip()
        marketplace_id = str(request.query_params.get("marketplace_id") or "").strip()
        if not query or not marketplace_id:
            return Response({"code": "ebay_taxonomy_invalid_request", "detail": "q and marketplace_id are required."}, status=400)
        if len(query) > 200 or len(marketplace_id) > 64:
            return Response({"code": "ebay_taxonomy_invalid_request", "detail": "q or marketplace_id is too long."}, status=400)
        try:
            return Response(EbayTaxonomyClient().category_suggestions(marketplace_id=marketplace_id, query=query))
        except EbayApiError as error:
            return _error_response(error)


class EbayCategoryAspectsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        marketplace_id = str(request.query_params.get("marketplace_id") or "").strip()
        category_id = str(request.query_params.get("category_id") or "").strip()
        if not marketplace_id or not category_id:
            return Response(
                {"code": "ebay_taxonomy_invalid_request", "detail": "marketplace_id and category_id are required."},
                status=400,
            )
        if len(marketplace_id) > 64 or len(category_id) > 64:
            return Response({"code": "ebay_taxonomy_invalid_request", "detail": "marketplace_id or category_id is too long."}, status=400)
        try:
            return Response(EbayTaxonomyClient().category_aspects(marketplace_id=marketplace_id, category_id=category_id))
        except EbayApiError as error:
            return _error_response(error)


class EbayCategoryTreeAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request):
        marketplace_id = str(request.query_params.get("marketplace_id") or "").strip()
        category_id = str(request.query_params.get("category_id") or "").strip()
        if not marketplace_id:
            return Response({"code": "ebay_taxonomy_invalid_request", "detail": "marketplace_id is required."}, status=400)
        if len(marketplace_id) > 64 or len(category_id) > 64:
            return Response({"code": "ebay_taxonomy_invalid_request", "detail": "marketplace_id or category_id is too long."}, status=400)

        cache_key = f"ebay:taxonomy:tree-node:{marketplace_id}:{category_id or 'root'}"
        response_payload = cache.get(cache_key)
        if response_payload is None:
            try:
                payload = EbayTaxonomyClient().category_tree(
                    marketplace_id=marketplace_id,
                    category_id=category_id or None,
                )
            except EbayApiError as error:
                return _error_response(error)
            node = payload.get("categorySubtreeNode") or payload.get("rootCategoryNode")
            if not isinstance(node, dict):
                return Response({"code": "ebay_taxonomy_invalid_response", "detail": "eBay taxonomy response does not contain a category node."}, status=502)
            response_payload = {"marketplace_id": marketplace_id, "node": _taxonomy_tree_node(node)}
            cache.set(cache_key, response_payload, timeout=3600)
        return Response(response_payload)


def _taxonomy_tree_node(node):
    category = node.get("category") if isinstance(node.get("category"), dict) else {}
    children = node.get("childCategoryTreeNodes") if isinstance(node.get("childCategoryTreeNodes"), list) else []
    return {
        "category_id": str(category.get("categoryId") or ""),
        "category_name": str(category.get("categoryName") or ""),
        "is_leaf": bool(node.get("leafCategoryTreeNode")),
        "children": [
            _taxonomy_tree_child(child)
            for child in children
            if isinstance(child, dict)
        ],
    }


def _taxonomy_tree_child(node):
    category = node.get("category") if isinstance(node.get("category"), dict) else {}
    return {
        "category_id": str(category.get("categoryId") or ""),
        "category_name": str(category.get("categoryName") or ""),
        "is_leaf": bool(node.get("leafCategoryTreeNode")),
    }


def _error_response(error: EbayApiError) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    code = "ebay_taxonomy_not_configured" if error.status_code is None and "credentials" in str(error).lower() else "ebay_taxonomy_request_failed"
    payload = {"code": code, "detail": str(error)}
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _oauth_error_response(error: EbayApiError) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    code = "ebay_oauth_not_configured" if error.status_code is None and "not configured" in str(error).lower() else "ebay_oauth_request_failed"
    return Response({"code": code, "detail": str(error)}, status=status_code)


def _seller_setup_error_response(error: EbayApiError, *, account: str | None = None, marketplace_id: str | None = None) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    code = "ebay_seller_setup_not_configured" if error.status_code is None and "not configured" in str(error).lower() else "ebay_seller_setup_request_failed"
    payload = {"code": code, "detail": str(error)}
    if error.operation:
        payload["operation"] = error.operation
    if account:
        payload["account"] = account
    if marketplace_id:
        payload["marketplace_id"] = marketplace_id
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _inventory_location_error_response(error: EbayApiError, *, account: str, merchant_location_key: str) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    code = "ebay_inventory_location_not_configured" if error.status_code is None and "not configured" in str(error).lower() else "ebay_inventory_location_request_failed"
    payload = {
        "code": code,
        "detail": str(error),
        "account": account,
        "merchant_location_key": merchant_location_key,
    }
    if error.operation:
        payload["operation"] = error.operation
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _selling_policy_management_error_response(error: EbayApiError, *, account: str) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    code = "ebay_selling_policy_management_not_configured" if error.status_code is None and "not configured" in str(error).lower() else "ebay_selling_policy_management_request_failed"
    payload = {"code": code, "detail": str(error), "account": account}
    if error.operation:
        payload["operation"] = error.operation
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _seller_policy_error_response(error: EbayApiError, *, account: str, policy_type: str) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    code = "ebay_seller_policy_not_configured" if error.status_code is None and "not configured" in str(error).lower() else "ebay_seller_policy_request_failed"
    payload = {"code": code, "detail": str(error), "account": account, "policy_type": policy_type}
    if error.operation:
        payload["operation"] = error.operation
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _shipping_services_error_response(error: EbayApiError, *, account: str, marketplace_id: str) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    code = "ebay_shipping_services_not_configured" if error.status_code is None and "not configured" in str(error).lower() else "ebay_shipping_services_request_failed"
    payload = {"code": code, "detail": str(error), "account": account, "marketplace_id": marketplace_id}
    if error.operation:
        payload["operation"] = error.operation
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _listing_error_response(error: EbayApiError, *, account: str, item_id: str, marketplace_id: str) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    payload = {
        "code": "ebay_listing_request_failed",
        "detail": str(error),
        "account": account,
        "item_id": item_id,
        "marketplace_id": marketplace_id,
    }
    if error.operation:
        payload["operation"] = error.operation
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _active_listings_error_response(error: EbayApiError, *, account: str, marketplace_id: str) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    payload = {
        "code": "ebay_active_listings_request_failed",
        "detail": str(error),
        "account": account,
        "marketplace_id": marketplace_id,
    }
    if error.operation:
        payload["operation"] = error.operation
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _inventory_item_error_response(error: EbayApiError, *, account: str, sku: str) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    payload = {"code": "ebay_inventory_item_request_failed", "detail": str(error), "account": account, "sku": sku}
    if error.operation:
        payload["operation"] = error.operation
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _offer_error_response(error: EbayApiError, *, account: str) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    payload = {"code": "ebay_offer_request_failed", "detail": str(error), "account": account}
    if error.operation:
        payload["operation"] = error.operation
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _listing_operation_error_response(
    error: EbayApiError,
    *,
    account: str,
    marketplace_id: str,
    operation: str,
    listing_mode: str,
    sku: str,
    item_id: str,
) -> Response:
    status_code = error.status_code if error.status_code and 400 <= error.status_code < 600 else 502
    payload = {
        "code": "ebay_listing_operation_request_failed",
        "detail": str(error),
        "account": account,
        "marketplace_id": marketplace_id,
        "operation": operation,
        "listing_mode": listing_mode,
    }
    if sku:
        payload["sku"] = sku
    if item_id:
        payload["item_id"] = item_id
    if error.operation:
        payload["ebay_operation"] = error.operation
    if error.details is not None:
        payload["details"] = error.details
    return Response(payload, status=status_code)


def _nonnegative_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    try:
        result = int(value)
    except (TypeError, ValueError):
        return None
    return result if result >= 0 else None


def _price(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized or len(normalized) > 20:
        return None
    try:
        decimal = Decimal(normalized)
    except (InvalidOperation, ValueError):
        return None
    return normalized if decimal.is_finite() and decimal >= 0 else None


def _inventory_location_address(payload: dict) -> dict[str, str] | None:
    raw_address = payload.get("address")
    if raw_address is None:
        raw_address = {
            "postalCode": payload.get("postal_code"),
            "country": payload.get("country"),
        }
    if not isinstance(raw_address, dict):
        return None
    aliases = {
        "addressLine1": "addressLine1",
        "address_line1": "addressLine1",
        "addressLine2": "addressLine2",
        "address_line2": "addressLine2",
        "city": "city",
        "stateOrProvince": "stateOrProvince",
        "state_or_province": "stateOrProvince",
        "postalCode": "postalCode",
        "postal_code": "postalCode",
        "country": "country",
    }
    address: dict[str, str] = {}
    for source, target in aliases.items():
        value = str(raw_address.get(source) or "").strip()
        if value:
            if len(value) > 128:
                return None
            address[target] = value
    country = address.get("country", "").upper()
    if len(country) != 2 or not country.isalpha():
        return None
    address["country"] = country
    has_postal_address = bool(address.get("postalCode"))
    has_city_address = bool(address.get("city") and address.get("stateOrProvince"))
    return address if has_postal_address or has_city_address else None


def _exchange_code_response(*, code: object, state: object) -> Response:
    normalized_code = str(code or "").strip()
    normalized_state = str(state or "").strip()
    if not normalized_code or not normalized_state:
        return Response({"code": "ebay_oauth_invalid_request", "detail": "code and state are required."}, status=400)
    try:
        payload = signing.loads(normalized_state, salt=_OAUTH_STATE_SALT, max_age=600)
        account = _account(payload.get("account") if isinstance(payload, dict) else None)
        if account is None:
            raise signing.BadSignature
    except signing.BadSignature:
        return Response({"code": "ebay_oauth_invalid_state", "detail": "OAuth state is invalid or expired."}, status=400)

    try:
        token_payload = EbayOAuthClient().exchange_code(code=normalized_code)
    except EbayApiError as error:
        return _oauth_error_response(error)

    refresh_token = str(token_payload.get("refresh_token") or "").strip()
    if not refresh_token:
        return Response({"code": "ebay_oauth_missing_refresh_token", "detail": "eBay did not return a refresh token."}, status=502)
    try:
        store_refresh_token(account=account, refresh_token=refresh_token)
    except EbayCredentialError as error:
        return Response({"code": "ebay_oauth_credential_store_unavailable", "detail": str(error)}, status=503)
    response = Response(
        {
            "account": account,
            "status": "connected",
        }
    )
    response["Cache-Control"] = "no-store"
    return response


def _account(value: object) -> str | None:
    account = str(value or "").strip().lower()
    return account if account in _EBAY_SELLER_ACCOUNTS else None


def _bounded_positive_int(value: object, *, default: int, maximum: int) -> int | None:
    normalized_value = str(value or "").strip()
    if not normalized_value:
        return default
    try:
        parsed_value = int(normalized_value)
    except ValueError:
        return None
    return parsed_value if 1 <= parsed_value <= maximum else None


def _marketplace_account_deletion_config() -> tuple[str | None, str | None]:
    endpoint = str(os.getenv(_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT_ENV) or "").strip()
    verification_token = str(os.getenv(_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN_ENV) or "").strip()
    if not endpoint.startswith("https://") or len(endpoint) > 2048:
        return None, None
    if not _VERIFICATION_TOKEN_PATTERN.fullmatch(verification_token):
        return None, None
    return endpoint, verification_token
