from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Marketplace(str, Enum):
    HOOD = "hood"
    KAUFLAND = "kaufland"
    OTTO = "otto"
    XLJV = "xljv"


class FinalStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    FAILED = "failed"


class Operation(str, Enum):
    PUBLISH = "publish"
    UPDATE = "update"
    UNPUBLISH = "unpublish"
    RELIST = "relist"


class CanonicalPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    price: str | None = None
    quantity: int | None = None
    images: list[str] | None = None
    categoryID: str | None = None
    condition: str | None = None
    itemMode: str | None = None
    itemNumber: str | None = None
    productProperties: list[dict] | None = None
    picture_urls: list[str] | None = None
    storefront: str | None = None
    unit_id: int | None = None

    productReference: str | None = None
    ean: str | None = None
    sku: str | None = None
    pzn: str | None = None
    mpn: str | None = None
    moin: str | None = None
    releaseDate: str | None = None
    productDescription: dict | None = None
    mediaAssets: list[dict] | None = None
    order: dict | None = None
    pricing: dict | None = None
    logistics: dict | None = None
    compliance: dict | None = None

    source_model: str | None = None
    source_sku: str | None = None
    source_ean_field: str | None = None
    status: bool | None = None
    manufacturer_id: int | None = None
    stock_status_id: int | None = None
    tax_class_id: int | None = None
    image: str | None = None
    date_available: str | None = None
    descriptions: list[dict] | None = None
    categories: list[dict] | None = None
    stores: list[dict] | None = None
    specials: list[dict] | None = None
    jv_fields: dict | None = None


class ChannelTarget(BaseModel):
    marketplace: Marketplace
    account: str | None = None
    profile: str | None = None
    site: str | None = None
    site_key: str | None = None
    changed_fields: list[str] = Field(default_factory=list)
    overrides: dict = Field(default_factory=dict)
    ean_source: Literal["main", "pool"] = "main"


class OrchestrateRequest(BaseModel):
    operation: Operation = Operation.UPDATE
    payload: CanonicalPayload
    channels: list[ChannelTarget]


class ErrorContract(BaseModel):
    code: str
    message: str
    request_id: str
    details: dict = Field(default_factory=dict)


class ChannelResult(BaseModel):
    marketplace: Marketplace
    target: str
    status: Literal["success", "failed"]
    status_code: int
    data: dict = Field(default_factory=dict)
    error: ErrorContract | None = None


class OrchestrateResponse(BaseModel):
    request_id: str
    status: FinalStatus
    results: list[ChannelResult]


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobPriority(str, Enum):
    URGENT = "urgent"
    NORMAL = "normal"
    BACKGROUND = "background"


class CreateJobRequest(BaseModel):
    ean: str
    command: OrchestrateRequest
    scheduled_at_unix_ms: int | None = None
    priority: JobPriority = JobPriority.NORMAL


class CreateJobResponse(BaseModel):
    job_id: str
    request_id: str
    status: JobStatus


class BatchCreateJobItem(BaseModel):
    ean: str
    command: OrchestrateRequest
    scheduled_at_unix_ms: int | None = None
    priority: JobPriority = JobPriority.NORMAL


class BatchCreateJobRequest(BaseModel):
    items: list[BatchCreateJobItem]


class BatchCreateJobResult(BaseModel):
    ean: str
    job_id: str | None = None
    status: Literal["queued", "failed"]
    error: ErrorContract | None = None


class BatchCreateJobResponse(BaseModel):
    request_id: str
    queued: int
    failed: int
    results: list[BatchCreateJobResult]


class BatchJobStatusRequest(BaseModel):
    job_ids: list[str]


class BatchJobStatusItem(BaseModel):
    job_id: str
    found: bool
    status: JobStatus | Literal["not_found"]
    ean: str | None = None
    operation: Operation | None = None
    updated_at_unix_ms: int | None = None
    error: ErrorContract | None = None


class BatchJobStatusResponse(BaseModel):
    request_id: str
    total: int
    found: int
    not_found: int
    results: list[BatchJobStatusItem]


class JobEvent(BaseModel):
    event_type: str
    at_unix_ms: int
    details: dict = Field(default_factory=dict)


class JobAttempt(BaseModel):
    attempt_no: int
    status: JobStatus
    started_at_unix_ms: int
    finished_at_unix_ms: int | None = None
    error: ErrorContract | None = None


class JobDetailsResponse(BaseModel):
    job_id: str
    request_id: str
    ean: str
    operation: Operation
    status: JobStatus
    created_at_unix_ms: int
    updated_at_unix_ms: int
    scheduled_at_unix_ms: int | None = None
    priority: JobPriority = JobPriority.NORMAL
    result: OrchestrateResponse | None = None
    error: ErrorContract | None = None


class ReconciliationChannelState(BaseModel):
    target: ChannelTarget
    payload: dict = Field(default_factory=dict)


class ReconciliationDiffItem(BaseModel):
    marketplace: Marketplace
    target: str
    has_drift: bool
    missing_fields: list[str] = Field(default_factory=list)
    mismatched_fields: list[str] = Field(default_factory=list)


class ReconciliationRequest(BaseModel):
    ean: str
    desired: OrchestrateRequest
    actual: list[ReconciliationChannelState] = Field(default_factory=list)
    apply_repair: bool = False


class ReconciliationResponse(BaseModel):
    request_id: str
    report_id: str
    ean: str
    total_channels: int
    channels_with_drift: int
    diffs: list[ReconciliationDiffItem]
    repair_job_id: str | None = None


class ReconciliationReport(BaseModel):
    report_id: str
    request_id: str
    ean: str
    created_at_unix_ms: int
    total_channels: int
    channels_with_drift: int
    diffs: list[ReconciliationDiffItem]
    repair_job_id: str | None = None
