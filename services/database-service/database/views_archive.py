from django.db import transaction
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .inventory_audit_service import record_inventory_change, request_actor
from .marketplace_deactivate_service import _find_kid_by_number
from .models import EanStatus, Kid
from .permissions import SessionRolePermission


class KidArchiveSerializer(serializers.Serializer):
    kid_number = serializers.CharField(max_length=128)
    kid_id = serializers.IntegerField(min_value=1, required=False)
    archived = serializers.BooleanField()


class KidArchiveAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        serializer = KidArchiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        kid = _find_kid_by_number(data["kid_number"], data.get("kid_id"))
        if kid is None:
            return Response({"detail": "Товар не найден."}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            kid = Kid.objects.select_for_update().get(pk=kid.pk)
            status_row = EanStatus.objects.filter(ean=kid).first()
            active = status_row is not None and any(
                getattr(status_row, field.name)
                for field in EanStatus._meta.fields
                if field.get_internal_type() == "BooleanField"
            )
            if data["archived"] and active:
                return Response(
                    {"detail": "Сначала деактивируйте активные маркетплейсы.", "code": "archive_active_marketplaces"},
                    status=status.HTTP_409_CONFLICT,
                )
            if kid.archived != data["archived"]:
                previous = kid.archived
                kid.archived = data["archived"]
                kid.save(update_fields=["archived"])
                record_inventory_change(
                    kid=kid, actor=request_actor(request), action="product_archived" if kid.archived else "product_restored",
                    changes=[{"field": "archived", "before": previous, "after": kid.archived}],
                )
        return Response({"kid_id": kid.pk, "archived": kid.archived})
