import requests

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from database.kid_number_utils import primary_kid_number
from database.models import Orders, Kid
from database.permissions import SessionRolePermission
from database.serializers import OrderModelSerializer

from .service import (
    build_parsed_items,
    collapse_items_to_orders,
    search_items,
    search_items_auktionsliste,
)
from .api_utils import (
    normalize_kid_account,
    parse_order_date,
    status_by_amounts,
)


class AfterbuyItemSearchAPIView(APIView):
    def get(self, request):
        ebay = (request.query_params.get("ebay") or "").strip()
        kundenname = (request.query_params.get("kundenname") or "").strip()
        kundennummer = (request.query_params.get("kundennummer") or "").strip()
        raw_max_items = (request.query_params.get("max_items") or "100").strip()

        if not (ebay or kundenname or kundennummer):
            return Response(
                {
                    "detail": "Передайте хотя бы один параметр: ebay, kundenname или kundennummer."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            max_items = max(1, min(int(raw_max_items), 500))
        except ValueError:
            return Response(
                {"detail": "Параметр max_items должен быть числом."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            items = search_items(
                ebay=ebay,
                kundenname=kundenname,
                kundennummer=kundennummer,
                max_sold_items=max_items,
            )
        except requests.RequestException as exc:
            return Response(
                {"detail": f"Afterbuy network error: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "count": len(items),
                "filters": {
                    "ebay": ebay,
                    "kundenname": kundenname,
                    "kundennummer": kundennummer,
                    "max_items": max_items,
                },
                "items": items,
            },
            status=status.HTTP_200_OK,
        )


class AfterbuyItemSearchWebAPIView(APIView):
    def get(self, request):
        ebay = (request.query_params.get("ebay") or "").strip()
        kundenname = (request.query_params.get("kundenname") or "").strip()
        kundennummer = (request.query_params.get("kundennummer") or "").strip()
        raw_max_total = (request.query_params.get("max_total") or "500").strip()
        raw_max_per_page = (request.query_params.get("max_items_per_page") or "20").strip()

        if not (ebay or kundenname or kundennummer):
            return Response(
                {
                    "detail": "Передайте хотя бы один параметр: ebay, kundenname или kundennummer."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            max_total = max(1, min(int(raw_max_total), 5000))
            max_items_per_page = max(1, min(int(raw_max_per_page), 100))
        except ValueError:
            return Response(
                {"detail": "max_total и max_items_per_page должны быть числами."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            items = search_items_auktionsliste(
                ebay=ebay,
                kundenname=kundenname,
                kundennummer=kundennummer,
                max_total=max_total,
                max_items_per_page=max_items_per_page,
            )
        except requests.RequestException as exc:
            return Response(
                {"detail": f"Afterbuy web network error: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        collapsed_items, _ = collapse_items_to_orders(items)

        return Response(
            {
                "count": len(items),
                "collapsed_count": len(collapsed_items),
                "filters": {
                    "ebay": ebay,
                    "kundenname": kundenname,
                    "kundennummer": kundennummer,
                    "max_total": max_total,
                    "max_items_per_page": max_items_per_page,
                },
                "items": items,
                "orders": collapsed_items,
                "parsed_items": build_parsed_items(items),
            },
            status=status.HTTP_200_OK,
        )


class CreateItemOrders(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        kundennummer = (request.data.get("kundennummer") or "").strip()
        order_id = str(request.data.get("order_id") or "").strip()
        raw_max_total = str(request.data.get("max_total") or "500").strip()
        raw_max_per_page = str(request.data.get("max_items_per_page") or "20").strip()

        if not kundennummer:
            return Response(
                {"kundennummer": ["Укажите kundennummer (он же Kid.kid_number)."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not order_id:
            return Response(
                {"order_id": ["Укажите order_id, который нужно создать в Orders."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            max_total = max(1, min(int(raw_max_total), 5000))
            max_items_per_page = max(1, min(int(raw_max_per_page), 100))
        except ValueError:
            return Response(
                {"detail": "max_total и max_items_per_page должны быть числами."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        kid = Kid.objects.filter(kid_number__contains=[kundennummer]).first()
        if kid is None:
            return Response(
                {"kundennummer": [f"Kid с kid_number='{kundennummer}' не найден в БД."]},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            items = search_items_auktionsliste(
                kundennummer=kundennummer,
                max_total=max_total,
                max_items_per_page=max_items_per_page,
            )
        except requests.RequestException as exc:
            return Response(
                {"detail": f"Afterbuy web network error: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        collapsed_items, _ = collapse_items_to_orders(items)

        selected_item = None
        for item in collapsed_items:
            order_id_main = str(item.get("main_order_id") or item.get("order_id") or "").strip()
            source_order_ids = [str(x).strip() for x in (item.get("source_order_ids") or [])]
            combined_ids = [part.strip() for part in str(item.get("order_id") or "").split(",") if part.strip()]
            if order_id == order_id_main or order_id in source_order_ids or order_id in combined_ids:
                selected_item = item
                break

        if selected_item is None:
            return Response(
                {"order_id": [f"order_id='{order_id}' не найден среди заказов kundennummer='{kundennummer}'."]},
                status=status.HTTP_404_NOT_FOUND,
            )

        source_account = normalize_kid_account(str(selected_item.get("source_account") or ""))
        if source_account and (kid.account or "").strip().upper() != source_account:
            kid.account = source_account
            kid.save(update_fields=["account"])

        order_id_to_save = str(selected_item.get("order_id") or "").strip()
        if not order_id_to_save:
            return Response(
                {"detail": "Не удалось определить main order_id для сохранения."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_ids = [str(x).strip() for x in (selected_item.get("source_order_ids") or []) if str(x).strip()]
        order_id_candidates = [order_id_to_save, *source_ids, order_id]
        seen_candidates = set()
        order_id_candidates = [
            value
            for value in order_id_candidates
            if value and not (value in seen_candidates or seen_candidates.add(value))
        ]
        existing = Orders.objects.filter(kid=kid, order_id__in=order_id_candidates).first()
        if existing is not None:
            fields_to_update: list[str] = []
            if existing.order_id != order_id_to_save:
                existing.order_id = order_id_to_save
                fields_to_update.append("order_id")
            if fields_to_update:
                existing.save(update_fields=fields_to_update)
            serializer = OrderModelSerializer(existing)
            return Response(
                {
                    "created": False,
                    "detail": "Связь Kid ↔ Order уже существует.",
                    "requested_order_id": order_id,
                    "saved_order_id": order_id_to_save,
                    "kid_account": kid.account,
                    "kid_number": primary_kid_number(kid.kid_number),
                    "source_order_ids": selected_item.get("source_order_ids") or [],
                    "order": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        verkaufsdatum = (selected_item.get("verkaufsdatum") or selected_item.get("order_date") or "").strip()
        zahlungssumme = (selected_item.get("zahlungssumme") or "").strip()
        rechnungssumme = (selected_item.get("rechnungssumme") or "").strip()

        order = Orders.objects.create(
            kid=kid,
            order_id=order_id_to_save,
            platform=((selected_item.get("platform") or "").strip() or None),
            buyer=((selected_item.get("buyer") or "").strip() or None),
            title=(selected_item.get("title") or "").strip(),
            sku=((selected_item.get("sku") or "").strip() or None),
            memo=((selected_item.get("memo") or "").strip() or None),
            date=parse_order_date(verkaufsdatum),
            status=status_by_amounts(zahlungssumme, rechnungssumme),
            payment_status=rechnungssumme or None
        )
        serializer = OrderModelSerializer(order)
        return Response(
            {
                "created": True,
                "requested_order_id": order_id,
                "saved_order_id": order_id_to_save,
                "kid_account": kid.account,
                "source_order_ids": selected_item.get("source_order_ids") or [],
                "order": serializer.data,
                "afterbuy_fields": {
                    "zahlungssumme": zahlungssumme,
                    "rechnungssumme": rechnungssumme,
                },
            },
            status=status.HTTP_201_CREATED,
        )
