from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission
from xl_services.batch_service import apply_batch, create_job_with_plan
from xl_services.batch_status import collect_language_mapping_by_site, collect_translation_status_by_site
from xl_services.models import ImportedProduct
from xl_services.serializers import XLBatchJobSerializer, XLBatchPayloadSerializer
from xl_services.views_common import force_xl_site


class XLBatchApplyByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request, ean: str):
        force_xl_site(request)
        serializer = XLBatchPayloadSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        payload["site_family"] = ImportedProduct.Site.XL
        idem_key = (request.headers.get("Idempotency-Key") or "").strip()

        job = create_job_with_plan(
            request=request,
            ean=ean.strip(),
            site_family=ImportedProduct.Site.XL,
            payload=payload,
            idempotency_key=idem_key,
        )
        summary = apply_batch(job=job)
        job.refresh_from_db()
        return Response(
            {
                "code": "xl_batch_apply_done",
                "detail": "XL batch apply completed.",
                "summary": summary,
                "job": XLBatchJobSerializer(job).data,
                "language_mapping_by_site": collect_language_mapping_by_site(job),
                "translation_status_by_site": collect_translation_status_by_site(job),
            },
            status=status.HTTP_200_OK,
        )


class XLBatchPlanByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request, ean: str):
        force_xl_site(request)
        serializer = XLBatchPayloadSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        payload["site_family"] = ImportedProduct.Site.XL
        idem_key = (request.headers.get("Idempotency-Key") or "").strip()

        job = create_job_with_plan(
            request=request,
            ean=ean.strip(),
            site_family=ImportedProduct.Site.XL,
            payload=payload,
            idempotency_key=idem_key,
        )
        return Response(
            {
                "code": "xl_batch_plan_ready",
                "detail": "XL batch plan prepared.",
                "job": XLBatchJobSerializer(job).data,
                "language_mapping_by_site": collect_language_mapping_by_site(job),
            },
            status=status.HTTP_201_CREATED,
        )
