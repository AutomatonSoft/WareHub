from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .models import ErrorContract, JobStatus

InventoryWorkspace = Literal["sofort", "benim_depom"]


class MarketplaceToggleRequest(BaseModel):
    kid_number: str
    inactive: bool = True
    place: str | None = None
    workspace: InventoryWorkspace = "sofort"


class MarketplaceToggleCreateResponse(BaseModel):
    job_id: str
    request_id: str
    status: JobStatus
    workspace: InventoryWorkspace


class MarketplaceToggleResultItem(BaseModel):
    ok: bool
    site_key: str
    channel: str
    status_code: int
    details: dict = Field(default_factory=dict)


class MarketplaceToggleSummary(BaseModel):
    total: int
    success: int
    failed: int


class MarketplaceToggleExecutionResult(BaseModel):
    status: Literal["ok", "partial", "failed"]
    inactive: bool
    summary: MarketplaceToggleSummary
    results: list[MarketplaceToggleResultItem]


class MarketplaceToggleJobResponse(BaseModel):
    job_id: str
    request_id: str
    kid_number: str
    inactive: bool
    workspace: InventoryWorkspace
    job_status: JobStatus
    status: Literal["queued", "running", "ok", "partial", "failed"]
    summary: MarketplaceToggleSummary | None = None
    results: list[MarketplaceToggleResultItem] = Field(default_factory=list)
    error: ErrorContract | None = None
