from rest_framework import status
from rest_framework.response import Response

from database.idempotency import build_request_hash, claim_or_replay, derive_idem_key


def claim_idempotency_or_response(*, request, scope: str, body) -> tuple[object | None, Response | None]:
    request_hash = build_request_hash(
        method=request.method,
        path=request.path,
        query=dict(request.query_params),
        body=body,
    )
    idem_key = derive_idem_key(request, request_hash)
    idem_state, idem_record = claim_or_replay(
        scope=scope,
        idem_key=idem_key,
        request_hash=request_hash,
    )
    if idem_state == "replay":
        return idem_record, Response(
            idem_record.response_payload,
            status=idem_record.status_code or status.HTTP_200_OK,
        )
    if idem_state == "processing":
        return idem_record, Response(
            {
                "code": "jv_idempotency_in_progress",
                "detail": "Request with same idempotency key is in progress.",
            },
            status=status.HTTP_409_CONFLICT,
        )
    if idem_state == "conflict":
        return idem_record, Response(
            {
                "code": "jv_idempotency_key_conflict",
                "detail": "Idempotency key reused with different payload.",
            },
            status=status.HTTP_409_CONFLICT,
        )
    return idem_record, None
