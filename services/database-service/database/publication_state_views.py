from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission
from kaufland.models import KauflandPublication
from otto_service.models import OttoPublication


class PublicationStateEntry(serializers.Serializer):
    key = serializers.CharField(max_length=512)
    marketplace = serializers.ChoiceField(choices=['otto', 'kaufland'])
    account = serializers.ChoiceField(choices=['jv', 'xl'])
    ean = serializers.CharField(max_length=64)


class PublicationStatesRequest(serializers.Serializer):
    entries = PublicationStateEntry(many=True, max_length=100)


class PublicationStatesAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        serializer = PublicationStatesRequest(data=request.data)
        serializer.is_valid(raise_exception=True)
        entries = serializer.validated_data['entries']
        eans = {entry['ean'] for entry in entries}
        otto = {(row.profile, row.ean): row for row in OttoPublication.objects.filter(ean__in=eans).order_by('submitted_at')}
        kaufland = {(row.controller, row.ean): row for row in KauflandPublication.objects.filter(ean__in=eans)}
        items = []
        for entry in entries:
            row = (otto if entry['marketplace'] == 'otto' else kaufland).get((entry['account'], entry['ean']))
            if row is None:
                continue
            state = row.state if entry['marketplace'] == 'otto' else ('online' if row.online else 'pending')
            items.append({
                **entry, 'state': state, 'online': row.online,
                'errors': row.errors, 'submitted_at_unix_ms': int(row.submitted_at.timestamp() * 1000),
                'task_id': getattr(row, 'task_id', ''),
            })
        return Response({'items': items})
