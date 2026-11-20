from rest_framework.response import Response
from rest_framework.views import exception_handler as default_exception_handler

from .ean_ownership import EanOwnershipConflict


def exception_handler(exc, context):
    if isinstance(exc, EanOwnershipConflict):
        return Response({
            'code': 'ean_owned_by_another_kid', 'detail': str(exc),
            'ean': exc.ean, 'owner_kid_id': exc.kid_id, 'owner_kid_number': exc.kid_number,
        }, status=409)
    return default_exception_handler(exc, context)
