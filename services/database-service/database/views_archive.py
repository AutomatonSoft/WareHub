from django.db import IntegrityError, transaction
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .inventory_audit_service import record_inventory_change, request_actor
from .marketplace_deactivate_service import _find_kid_by_number
from .models import Kid
from .permissions import SessionRolePermission
from .place_rules import normalize_place, place_sign


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
        except IntegrityError:
            return Response({"place": ["Это место уже занято. Выберите другое."]}, status=status.HTTP_409_CONFLICT)
        return Response({"kid_id": kid.pk, "archived": kid.archived, "place": kid.place})
