from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


def _load_local_env() -> None:
    current_file = Path(__file__).resolve()
    repo_root = None
    for directory in current_file.parents:
        if directory.name == "services" and directory.parent.name:
            repo_root = directory.parent
            break

    if repo_root is None:
        return

    env_path = repo_root / ".env"
    if env_path.is_file():
        load_dotenv(env_path, override=False)


_load_local_env()


class Settings:
    def __init__(self) -> None:
        self.base_url = os.getenv("DATABASE_SERVICE_BASE_URL", "http://localhost:8000").rstrip("/")
        self.service_auth_token = (os.getenv("ORCHESTRATOR_SERVICE_AUTH_TOKEN") or "").strip()
        self.timeout_seconds = float(os.getenv("ORCHESTRATOR_HTTP_TIMEOUT_SECONDS", "8"))
        self.discover_timeout_seconds = float(os.getenv("ORCHESTRATOR_DISCOVER_TIMEOUT_SECONDS", "15"))
        self.marketplace_toggle_timeout_seconds = float(os.getenv("ORCHESTRATOR_MARKETPLACE_TOGGLE_TIMEOUT_SECONDS", "60"))
        self.retries = int(os.getenv("ORCHESTRATOR_HTTP_RETRIES", "2"))
        self.idempotency_ttl_seconds = int(os.getenv("ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS", "86400"))
        self.idempotency_sqlite_path = os.getenv("ORCHESTRATOR_IDEMPOTENCY_SQLITE_PATH", "./data/orchestrator_idempotency.sqlite3")
        self.jobs_sqlite_path = os.getenv("ORCHESTRATOR_JOBS_SQLITE_PATH", "./data/orchestrator_jobs.sqlite3")
        self.enable_job_worker = os.getenv("ORCHESTRATOR_ENABLE_JOB_WORKER", "1") == "1"
        self.job_worker_poll_interval_seconds = float(os.getenv("ORCHESTRATOR_JOB_WORKER_POLL_INTERVAL_SECONDS", "0.2"))
        self.enable_reconciliation_scheduler = os.getenv("ORCHESTRATOR_ENABLE_RECONCILIATION_SCHEDULER", "0") == "1"
        self.enable_otto_category_scheduler = os.getenv("ORCHESTRATOR_ENABLE_OTTO_CATEGORY_SCHEDULER", "0") == "1"
        self.otto_category_scheduler_poll_interval_seconds = float(os.getenv("ORCHESTRATOR_OTTO_CATEGORY_SCHEDULER_POLL_INTERVAL_SECONDS", "3600"))
        self.reconciliation_scheduler_poll_interval_seconds = float(
            os.getenv("ORCHESTRATOR_RECONCILIATION_SCHEDULER_POLL_INTERVAL_SECONDS", "5")
        )
        self.reconciliation_reports_ttl_seconds = int(os.getenv("ORCHESTRATOR_RECONCILIATION_REPORTS_TTL_SECONDS", "604800"))
        self.reconciliation_reports_max_per_ean = int(os.getenv("ORCHESTRATOR_RECONCILIATION_REPORTS_MAX_PER_EAN", "50"))
        self.jobs_batch_max_items = int(os.getenv("ORCHESTRATOR_JOBS_BATCH_MAX_ITEMS", "100"))
        self.jobs_status_batch_max_items = int(os.getenv("ORCHESTRATOR_JOBS_STATUS_BATCH_MAX_ITEMS", "200"))
        self.job_intake_rate_limit_window_seconds = int(os.getenv("ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_WINDOW_SECONDS", "60"))
        self.job_intake_rate_limit_max_jobs = int(os.getenv("ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_JOBS", "10000"))
        self.job_intake_rate_limit_max_urgent_jobs = int(os.getenv("ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_URGENT_JOBS", "10000"))
        self.job_intake_rate_limit_max_normal_jobs = int(os.getenv("ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_NORMAL_JOBS", "10000"))
        self.job_intake_rate_limit_max_background_jobs = int(os.getenv("ORCHESTRATOR_JOB_INTAKE_RATE_LIMIT_MAX_BACKGROUND_JOBS", "10000"))
        self.enable_circuit_breaker = os.getenv("ORCHESTRATOR_ENABLE_CIRCUIT_BREAKER", "1") == "1"
        self.circuit_breaker_failure_threshold = int(os.getenv("ORCHESTRATOR_CIRCUIT_BREAKER_FAILURE_THRESHOLD", "3"))
        self.circuit_breaker_open_seconds = float(os.getenv("ORCHESTRATOR_CIRCUIT_BREAKER_OPEN_SECONDS", "10"))
        self.enable_channel_limiter = os.getenv("ORCHESTRATOR_ENABLE_CHANNEL_LIMITER", "1") == "1"
        self.channel_limiter_max_inflight_per_key = int(os.getenv("ORCHESTRATOR_CHANNEL_LIMITER_MAX_INFLIGHT_PER_KEY", "1"))
        self.service_name = os.getenv("ORCHESTRATOR_SERVICE_NAME", "sb-sofort-orchestrator-service")
        self.log_level = os.getenv("ORCHESTRATOR_LOG_LEVEL", "INFO").upper()


settings = Settings()
