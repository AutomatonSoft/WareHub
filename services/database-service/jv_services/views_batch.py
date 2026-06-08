import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from database.permissions import SessionRolePermission

from .batch_service import create_job_with_plan
from .models import ImportedProduct, JVBatchJob, JVBatchJobItem
from .serializers import JVBatchJobSerializer, JVBatchPayloadSerializer
from .source_client import fetch_source_language_id_by_locale, source_db_config_for_site

logger = logging.getLogger(__name__)


def _collect_language_mapping_by_site(job: JVBatchJob) -> list[dict]:
    rows: list[dict] = []
    selected_by_key = {}
    for item in job.items.all().order_by("id"):
        key = (str(item.site or ""), str(item.site_key or ""), str(item.domain or ""))
        current = selected_by_key.get(key)
        if current is None or item.status == JVBatchJobItem.Status.APPLIED:
            selected_by_key[key] = item

    for item in selected_by_key.values():
        if item.status not in {JVBatchJobItem.Status.APPLIED, JVBatchJobItem.Status.PENDING}:
            continue

        details = item.details or {}
        language_map = details.get("language_id_by_locale")
        if not isinstance(language_map, dict) or len(language_map) == 0:
            db_config = source_db_config_for_site(item.site, site_key=item.site_key or None)
            if db_config:
                try:
                    language_map = fetch_source_language_id_by_locale(db_config) or {}
                except Exception:
                    logger.warning(
                        "JV_LANGUAGE_MAP_FALLBACK_FAILED code=jv_language_map_fallback_failed site=%s site_key=%s",
                        item.site,
                        item.site_key,
                        exc_info=True,
                    )
                    language_map = {}
            else:
                language_map = {}

        normalized_map: dict[str, int] = {}
        for locale, language_id in (language_map or {}).items():
            locale_key = str(locale or "").strip().lower()
            if not locale_key:
                continue
            try:
                normalized_map[locale_key] = int(language_id)
            except (TypeError, ValueError):
                continue

        if not normalized_map:
            continue

        rows.append(
            {
                "site": item.site,
                "site_key": item.site_key,
                "domain": item.domain,
                "target_locale": details.get("target_locale") or "",
                "language_id_by_locale": normalized_map,
            }
        )
    return rows


def _collect_translation_status_by_site(job: JVBatchJob) -> list[dict]:
    rows: list[dict] = []
    for item in job.items.all().order_by("id"):
        details = item.details or {}
        meta = details.get("translation_meta") or {}
        used = bool(meta.get("translation_used"))
        error = meta.get("translation_error")
        if not used and not error:
            continue
        rows.append(
            {
                "site": item.site,
                "site_key": item.site_key,
                "domain": item.domain,
                "translation_used": used,
                "translation_error": str(error) if error else None,
            }
        )
    return rows


class JVBatchPlanByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request, ean: str):
        serializer = JVBatchPayloadSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        site_family = ImportedProduct.Site.JV
        idem_key = (request.headers.get("Idempotency-Key") or "").strip()

        job = create_job_with_plan(
            request=request,
            ean=ean.strip(),
            site_family=site_family,
            payload=payload,
            idempotency_key=idem_key,
        )
        return Response(
            {
                "code": "jv_batch_plan_ready",
                "detail": "Batch plan prepared.",
                "job": JVBatchJobSerializer(job).data,
                "language_mapping_by_site": _collect_language_mapping_by_site(job),
            },
            status=status.HTTP_201_CREATED,
        )


class JVBatchApplyByEANAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def post(self, request, ean: str):
        serializer = JVBatchPayloadSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        idem_key = (request.headers.get("Idempotency-Key") or "").strip()

        job = create_job_with_plan(
            request=request,
            ean=ean.strip(),
            site_family=ImportedProduct.Site.JV,
            payload=payload,
            idempotency_key=idem_key,
            initial_status=JVBatchJob.Status.PENDING,
            build_plan_now=False,
        )
        return Response(
            {
                "code": "jv_batch_apply_accepted",
                "detail": "Batch apply accepted and queued.",
                "accepted": True,
                "job": JVBatchJobSerializer(job).data,
                "language_mapping_by_site": _collect_language_mapping_by_site(job),
            },
            status=status.HTTP_202_ACCEPTED,
        )


class JVBatchJobStatusAPIView(APIView):
    permission_classes = [SessionRolePermission]

    def get(self, request, job_id: int):
        try:
            job = JVBatchJob.objects.get(pk=int(job_id))
        except JVBatchJob.DoesNotExist:
            return Response(
                {
                    "code": "jv_batch_job_not_found",
                    "detail": "Batch job not found.",
                    "job_id": int(job_id),
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "code": "jv_batch_job_status",
                "detail": "Batch job status fetched.",
                "job": JVBatchJobSerializer(job).data,
                "language_mapping_by_site": _collect_language_mapping_by_site(job),
                "translation_status_by_site": _collect_translation_status_by_site(job),
            },
            status=status.HTTP_200_OK,
        )
