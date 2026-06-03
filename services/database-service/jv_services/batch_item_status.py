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


def mark_item_skipped(item: JVBatchJobItem, summary: dict, *, code: str, text: str) -> None:
    item.status = JVBatchJobItem.Status.SKIPPED
    item.error_code = code
    item.error_text = text
    item.save(update_fields=["status", "error_code", "error_text", "updated_at"])
    summary["skipped"] += 1


def mark_item_failed(item: JVBatchJobItem, summary: dict, *, code: str, text: str) -> None:
    item.status = JVBatchJobItem.Status.FAILED
    item.error_code = code
    item.error_text = text
    item.save(update_fields=["status", "error_code", "error_text", "updated_at"])
    summary["failed"] += 1


def mark_item_applied(item: JVBatchJobItem, summary: dict, *, details: dict) -> None:
    item.status = JVBatchJobItem.Status.APPLIED
    item.error_code = ""
    item.error_text = ""
    item.details = details
    item.save(update_fields=["status", "error_code", "error_text", "details", "updated_at"])
    summary["applied"] += 1


def finalize_batch_job(job: JVBatchJob, summary: dict) -> dict:
    job.status = JVBatchJob.Status.APPLIED if summary["failed"] == 0 else JVBatchJob.Status.FAILED
    job.result_summary = summary
    job.save(update_fields=["status", "result_summary", "updated_at"])
    return summary
