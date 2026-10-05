import json
import logging

from pymongo.errors import PyMongoError
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission
from .attribute_suggestions import OttoAttributeSuggestionError, product_facts, suggest_otto_attributes
from .category_cache import OttoCategoryCache
from .external_requests import OttoExternalAPIError, OttoExternalProductsClient

logger = logging.getLogger(__name__)


class OttoAttributeSuggestionRequest(serializers.Serializer):
    categoryId = serializers.CharField(max_length=100)
    product = serializers.JSONField()

    def validate_product(self, value):
        if not isinstance(value, dict) or len(json.dumps(value, ensure_ascii=False)) > 60000:
            raise serializers.ValidationError('Product must be an object of at most 60000 characters.')
        if not any(product_facts(value).values()):
            raise serializers.ValidationError('Load a source product or enter product details first.')
        return value


class OttoAttributeSuggestionsAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request):
        serializer = OttoAttributeSuggestionRequest(data=request.data)
        serializer.is_valid(raise_exception=True)
        category_id = serializer.validated_data['categoryId']
        try:
            cache = OttoCategoryCache()
            attributes = cache.attributes(category_id)
            if attributes is None:
                attributes = OttoExternalProductsClient().fetch_attributes(category_id=category_id)['attributes']
                cache.store_attributes(category_id, attributes)
            result = suggest_otto_attributes(category_id=category_id, product=serializer.validated_data['product'], attributes=attributes)
        except (RuntimeError, PyMongoError, OttoExternalAPIError):
            logger.warning('OTTO_AI_TAXONOMY_UNAVAILABLE category_id=%s', category_id)
            return Response({'detail': 'OTTO category attributes are temporarily unavailable.'}, status=503)
        except OttoAttributeSuggestionError as error:
            logger.warning('OTTO_AI_SUGGESTIONS_FAILED category_id=%s', category_id)
            return Response({'detail': str(error)}, status=503)
        return Response({'categoryId': category_id, **result})
