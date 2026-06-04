from django.utils import timezone

from .models import JVBatchJob, JVBatchJobItem


def new_batch_summary() -> dict:
    return {
        "total": 0,
        "applied": 0,
        "failed": 0,
        "skipped": 0,
        "translation_used_sites": 0,
        "translation_error_sites": 0,
    }


def _phase_stamp() -> str:
    return timezone.now().isoformat()


def _details_with_progress(details: dict | None, *, phase: str, message: str) -> dict:
    payload = dict(details or {})
    payload["progress_phase"] = str(phase or "").strip().lower()
    payload["progress_message"] = str(message or "").strip()
    payload["phase_updated_at"] = _phase_stamp()
    return payload


def append_item_debug_trace(details: dict | None, *, event: str, **fields) -> dict:
    payload = dict(details or {})
    trace = payload.get("_debug_trace")
    if not isinstance(trace, list):
        trace = []
    entry = {"ts": _phase_stamp(), "event": str(event or "").strip()}
    entry.update(fields)
    trace.append(entry)
    payload["_debug_trace"] = trace[-40:]
    return payload


def update_job_progress(job: JVBatchJob, *, phase: str, message: str) -> None:
    summary = dict(job.result_summary or {})
    summary["progress_phase"] = str(phase or "").strip().lower()
    summary["progress_message"] = str(message or "").strip()
    summary["phase_updated_at"] = _phase_stamp()
    job.result_summary = summary
    job.save(update_fields=["result_summary", "updated_at"])


def update_item_progress(item: JVBatchJobItem, *, phase: str, message: str, details: dict | None = None) -> None:
    item.details = _details_with_progress(details if details is not None else item.details, phase=phase, message=message)
    item.save(update_fields=["details", "updated_at"])


def mark_item_skipped(item: JVBatchJobItem, summary: dict, *, code: str, text: str, details: dict | None = None) -> None:
    item.status = JVBatchJobItem.Status.SKIPPED
    item.error_code = code
    item.error_text = text
    item.details = _details_with_progress(details if details is not None else item.details, phase="skipped", message=text)
    item.save(update_fields=["status", "error_code", "error_text", "details", "updated_at"])
    summary["skipped"] += 1


def mark_item_failed(item: JVBatchJobItem, summary: dict, *, code: str, text: str, details: dict | None = None) -> None:
    item.status = JVBatchJobItem.Status.FAILED
    item.error_code = code
    item.error_text = text
    item.details = _details_with_progress(details if details is not None else item.details, phase="failed", message=text)
    item.save(update_fields=["status", "error_code", "error_text", "details", "updated_at"])
    summary["failed"] += 1


def mark_item_applied(item: JVBatchJobItem, summary: dict, *, details: dict) -> None:
    item.status = JVBatchJobItem.Status.APPLIED
    item.error_code = ""
    item.error_text = ""
    traced_details = append_item_debug_trace(
        details,
        event="mark_item_applied",
        job_id=int(item.job_id),
        item_id=int(item.id),
        site=str(item.site or ""),
        site_key=str(item.site_key or ""),
        target_locale=str((details or {}).get("target_locale") or ""),
        lieferzeitid=str((((details or {}).get("jv_fields") or {}) if isinstance((details or {}).get("jv_fields"), dict) else {}).get("lieferzeitid") or ""),
        delivery_mapping_meta=(details or {}).get("delivery_mapping_meta") or {},
        translation_meta=(details or {}).get("translation_meta") or {},
        translation_meta_jv_content_error=str((details or {}).get("translation_meta_jv_content_error") or ""),
    )
    item.details = _details_with_progress(traced_details, phase="applied", message="Applied to source DB.")
    item.save(update_fields=["status", "error_code", "error_text", "details", "updated_at"])
    summary["applied"] += 1


def finalize_batch_job(job: JVBatchJob, summary: dict) -> dict:
    result = dict(job.result_summary or {})
    result.update(summary or {})
    result["progress_phase"] = "completed" if summary["failed"] == 0 else "failed"
    result["progress_message"] = "Batch apply completed." if summary["failed"] == 0 else "Batch apply completed with failures."
    result["phase_updated_at"] = _phase_stamp()
    job.status = JVBatchJob.Status.APPLIED if summary["failed"] == 0 else JVBatchJob.Status.FAILED
    job.result_summary = result
    job.save(update_fields=["status", "result_summary", "updated_at"])
    return result
