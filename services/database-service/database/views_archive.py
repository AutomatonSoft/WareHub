import logging

from django.db import IntegrityError, transaction
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .inventory_audit_service import record_inventory_change, request_actor
from .kid_number_utils import primary_kid_number
from .marketplace_deactivate_service import _find_kid_by_number
from .models import Kid
from .permissions import SessionRolePermission
from .place_rules import find_place_conflict, normalize_place, place_sign

logger = logging.getLogger(__name__)
PLACE_UNIQUE_CONSTRAINT = "uniq_kid_non_empty_place"


class KidArchiveSerializer(serializers.Serializer):
    kid_number = serializers.CharField(max_length=128)
    kid_id = serializers.IntegerField(min_value=1, required=False)
    archived = serializers.BooleanField()
    place = serializers.CharField(max_length=255, required=False)

    def validate(self, attrs):
        if not attrs["archived"]:
            place = normalize_place(str(attrs.get("place") or "").strip().lstrip("+").lstrip("0"))
            if place_sign(place) <= 0:
                raise serializers.ValidationError({"place": "Укажите новое положительное место (place)."})
            attrs["place"] = place
        return attrs


class KidArchiveAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        serializer = KidArchiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        kid = _find_kid_by_number(data["kid_number"], data.get("kid_id"))
        if kid is None:
            return Response({"detail": "Товар не найден."}, status=status.HTTP_404_NOT_FOUND)
        try:
            with transaction.atomic():
                kid = Kid.objects.select_for_update().get(pk=kid.pk)
                changes = []
                if not data["archived"] and kid.place != data["place"]:
                    changes.append({"field": "place", "before": kid.place, "after": data["place"]})
                    kid.place = data["place"]
                if kid.archived != data["archived"]:
                    changes.append({"field": "archived", "before": kid.archived, "after": data["archived"]})
                    kid.archived = data["archived"]
                if changes:
                    kid.save(update_fields=[change["field"] for change in changes])
                    record_inventory_change(
                        kid=kid, actor=request_actor(request), action="product_archived" if kid.archived else "product_restored",
                        changes=changes,
                    )
        except IntegrityError as error:
            constraint = getattr(getattr(error.__cause__, "diag", None), "constraint_name", None)
            if constraint == PLACE_UNIQUE_CONSTRAINT and not data["archived"]:
                conflict = find_place_conflict(data["place"], exclude_kid_id=kid.pk)
                message = "Это место уже занято. Выберите другое."
                if conflict:
                    location = "архив" if conflict.archived else "склад"
                    message = f"Место {conflict.place} занято товаром KID {primary_kid_number(conflict.kid_number)} ({location}). Выберите другое."
                return Response({
                    "code": "inventory_place_occupied",
                    "place": [message],
                    "conflict": {"kid_id": conflict.pk, "kid_number": conflict.kid_number,
                                 "archived": conflict.archived, "place": conflict.place} if conflict else None,
                }, status=status.HTTP_409_CONFLICT)
            logger.error("inventory_archive_save_failed kid_id=%s constraint=%s", kid.pk, constraint)
            return Response({
                "code": "inventory_archive_save_failed",
                "detail": "Не удалось сохранить изменение архива. Повторите попытку или обратитесь к администратору.",
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response({"kid_id": kid.pk, "archived": kid.archived, "place": kid.place})
